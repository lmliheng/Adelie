package dev.adelie.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 后台屏（MediaProjection）专用前台服务。
 *
 * <p>Android 14 起，用 MediaProjection 的应用必须有一个 `mediaProjection` 类型的前台服务，
 * 而且要在拿到授权之后、建立虚拟显示之前起来；否则系统会直接抛 SecurityException。
 */
public class ProjectionService extends Service {
    private static final String CHANNEL = "adelie_projection";
    private static final int NOTIFICATION_ID = 2;

    public static void start(Context ctx) {
        Intent intent = new Intent(ctx, ProjectionService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent);
            else ctx.startService(intent);
        } catch (Exception ignored) {
        }
    }

    public static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, ProjectionService.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, notification());
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification notification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null
                && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "后台屏",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 2, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return b.setContentTitle("Adelie 后台屏开着")
                .setContentText("被操作的应用跑在虚拟显示上，你的屏幕还能继续用")
                .setSmallIcon(R.drawable.ic_nav_chat_filled)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }
}
