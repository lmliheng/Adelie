package dev.adelie.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 更新没成时的通知：下不回来、或者下回来校验对不上。
 *
 * <p>1.0.16 起下完先校验 sha256，对不上就当场删包 —— 但那时的提示只是个 Toast，
 * 人要是正在别的应用里，转眼就没了，下回还得自己想起来去设置里点检查更新。
 * 这里换成一条通知，带「重新下载」：点了直接回去把清单再看一遍、有新版就接着下，
 * 不用再从设置里翻一遍。
 */
final class UpdateNotifier {

    private static final String CHANNEL = "adelie_update";
    /** 和任务通知(42)、两个前台服务(1/2) 岔开。 */
    static final int ID_VERIFY_FAILED = 43;
    static final int ID_DOWNLOAD_FAILED = 44;

    private UpdateNotifier() {
    }

    /** 包下回来了，但 sha256 对不上，已经删掉。 */
    static void verifyFailed(Context ctx) {
        post(ctx, ID_VERIFY_FAILED,
                ctx.getString(R.string.update_verify_failed_title),
                ctx.getString(R.string.update_verify_failed_body));
    }

    /** 下载没成功（被取消、断网、服务器不给文件都算）。 */
    static void downloadFailed(Context ctx) {
        post(ctx, ID_DOWNLOAD_FAILED,
                ctx.getString(R.string.update_download_failed_title),
                ctx.getString(R.string.update_download_failed_body));
    }

    static void cancel(Context ctx) {
        if (ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(ID_VERIFY_FAILED);
        nm.cancel(ID_DOWNLOAD_FAILED);
    }

    private static void post(Context ctx, int id, String title, String body) {
        if (ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannel(nm, ctx);

        Intent retry = new Intent(ctx, UpdateActionReceiver.class)
                .setAction(UpdateActionReceiver.ACTION)
                .putExtra(UpdateActionReceiver.EXTRA_OP, UpdateActionReceiver.OP_RETRY);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, id, retry,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, CHANNEL)
                : new Notification.Builder(ctx);
        b.setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setSmallIcon(R.drawable.ic_nav_chat_filled)
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(null,
                        ctx.getString(R.string.update_retry), pi).build());
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
            // 没给通知权限：那就只剩 Toast，别因此影响别的
        }
    }

    private static void ensureChannel(NotificationManager nm, Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "更新",
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("更新包下载失败或校验没通过时的提示");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
