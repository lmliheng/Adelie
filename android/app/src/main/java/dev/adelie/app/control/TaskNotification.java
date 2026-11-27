package dev.adelie.app.control;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import dev.adelie.app.MainActivity;
import dev.adelie.app.R;

/**
 * 手机操控进行中的通知栏进度：哪一步、第几步、在哪个应用里，带「暂停 / 免确认 / 停止」三个按钮。
 *
 * <p>浮层只在 Adelie 在前台时看得见；agent 干活时人往往在看别的应用，通知栏是唯一
 * 一直看得到、也点得到的地方。安静通道（IMPORTANCE_LOW，不出声、不弹窗），
 * 每秒最多刷几次，别让系统被通知刷屏。
 *
 * <p>「免确认」这一项是给「人在忙、不想每步都点头」的场景：点一下这一轮剩下的动作
 * 都不再弹确认卡，按钮变成「恢复确认」，再点一下又要点头。任务结束就归零，
 * 不会一路带到下一轮。
 */
public final class TaskNotification {

    private static final String CHANNEL = "adelie_task";
    /** 和 BootService(1)、ProjectionService(2) 岔开，单测里也要按这个号找。 */
    static final int NOTIFICATION_ID = 42;
    /** 一轮结束后留下的那份回执，跟进度通知分开：进度收走，回执还在。 */
    static final int RECEIPT_ID = 45;
    /** 同一段文字最多每 400ms 刷一次；暂停/停止这类切换不受限（键不同）。 */
    private static final long MIN_INTERVAL_MS = 400;

    private static long lastAt;
    private static String lastKey;

    private TaskNotification() {
    }

    static void show(String step, String app, int stepCount, boolean paused, long startedAt) {
        show(step, app, stepCount, paused, PhoneControl.allowAllNow(), startedAt);
    }

    static void show(String step, String app, int stepCount, boolean paused, boolean allowAll,
                     long startedAt) {
        Context ctx = PhoneControl.context();
        if (ctx == null) return;
        String text = step == null ? "" : step;
        String key = text + '|' + app + '|' + stepCount + '|' + paused + '|' + allowAll;
        long now = System.currentTimeMillis();
        if (key.equals(lastKey) && now - lastAt < MIN_INTERVAL_MS) return;
        lastKey = key;
        lastAt = now;

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm, ctx);

        StringBuilder sub = new StringBuilder("第 ").append(Math.max(1, stepCount)).append(" 步");
        if (app != null && !app.isEmpty()) sub.append(" · ").append(app);
        if (allowAll) sub.append(" · 已免确认");

        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, 42, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, CHANNEL)
                : new Notification.Builder(ctx);
        b.setContentTitle(paused ? "Adelie 已暂停" : "Adelie 正在操作手机")
                .setContentText(text.isEmpty() ? "正在准备下一步" : text)
                .setSubText(sub)
                .setSmallIcon(R.drawable.ic_nav_chat_filled)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(contentIntent)
                .addAction(action(ctx, 10, "pause", paused ? "继续" : "暂停"))
                .addAction(action(ctx, 12, "allow", allowAll ? "恢复确认" : "免确认"))
                .addAction(action(ctx, 11, "stop", "停止"));
        if (paused) {
            b.setShowWhen(false);
        } else {
            b.setWhen(startedAt)
                    .setShowWhen(true)
                    .setUsesChronometer(true);
        }
        try {
            nm.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {
            // 13+ 没给通知权限：那就只剩浮层，别因此影响动作本身
        }
    }

    static void hide() {
        Context ctx = PhoneControl.context();
        lastKey = null;
        if (ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {
        }
    }

    /**
     * 一轮结束的回执：进度通知收走之后，用户切回来才不至于「刚才到底做了什么」一片空白。
     * 标题说结果，正文说规模（几步、几次没成、在哪个应用），点开就是这一轮的回放。
     * 同样走安静通道，可划掉，不打扰。
     */
    static void receipt(int steps, int failed, String app) {
        Context ctx = PhoneControl.context();
        if (ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm, ctx);

        Intent open = new Intent(ctx, MainActivity.class)
                .putExtra(MainActivity.EXTRA_OPEN_JOURNAL, true);
        PendingIntent contentIntent = PendingIntent.getActivity(ctx, RECEIPT_ID, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, CHANNEL)
                : new Notification.Builder(ctx);
        b.setContentTitle(receiptTitle(failed))
                .setContentText(receiptText(steps, failed, app))
                .setSmallIcon(R.drawable.ic_nav_chat_filled)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(contentIntent);
        try {
            nm.notify(RECEIPT_ID, b.build());
        } catch (SecurityException ignored) {
            // 没给通知权限：回放页还在设置里，不影响动作本身
        }
    }

    /** 回执标题：成了就是一句「完成了」，没成先把数量说清楚。 */
    static String receiptTitle(int failed) {
        if (failed <= 0) return "这一轮操作完成了";
        return "这一轮有 " + failed + " 步没成";
    }

    /** 回执正文：「7 步 · 1 次失败 · 微信」，没失败就不写那一段。 */
    static String receiptText(int steps, int failed, String app) {
        StringBuilder sb = new StringBuilder();
        sb.append(Math.max(1, steps)).append(" 步");
        if (failed > 0) sb.append(" · ").append(failed).append(" 次失败");
        if (app != null && !app.isEmpty()) sb.append(" · ").append(app);
        return sb.toString();
    }

    static void hideReceipt() {
        Context ctx = PhoneControl.context();
        if (ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.cancel(RECEIPT_ID);
        } catch (Exception ignored) {
        }
    }

    /** 三个按钮都走同一个广播接收器，带上 op=pause / allow / stop。 */
    private static Notification.Action action(Context ctx, int requestCode, String op, String title) {
        Intent intent = new Intent(ctx, ControlActionReceiver.class)
                .setAction(ControlActionReceiver.ACTION_TASK)
                .putExtra(ControlActionReceiver.EXTRA_OP, op);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(null, title, pi).build();
    }

    private static void ensureChannel(NotificationManager nm, Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "操作手机",
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Adelie 操作手机时的进度，带暂停、免确认和停止");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }
}
