package dev.adelie.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 前台服务：让 node 进程在用户切到别的应用之后仍然活着。
 * 聊天要等模型几十秒到几分钟，Activity 一进后台就被回收会让整轮对话断掉。
 */
public class BootService extends Service {
    private static final String CHANNEL = "adelie";
    private static final int NOTIFICATION_ID = 1;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, notification());
        Core.start(getApplicationContext());
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Core.stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification notification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null
                && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Adelie 服务",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return b.setContentTitle("Adelie 正在运行")
                .setContentText("本地服务在 127.0.0.1 上，点开回到对话")
                .setSmallIcon(R.drawable.ic_nav_chat_filled)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }
}
