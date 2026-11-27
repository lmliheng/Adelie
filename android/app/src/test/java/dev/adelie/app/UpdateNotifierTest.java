package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 更新没成时的那条通知：下不回来、或者校验对不上，都要留下一条看得见、点得动的记录。
 *
 * <p>以前只有一个 Toast：人在别的应用里根本看不到，回头还得自己想起来去设置里再点一遍。
 * 现在通知里带「重新下载」，点了直接回 Adelie 接着走。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class UpdateNotifierTest {

    private Context ctx;
    private NotificationManager nm;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancelAll();
    }

    private Notification notification(int id) {
        return shadowOf(nm).getNotification(id);
    }

    private String title(Notification n) {
        return String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TITLE));
    }

    @Test
    public void verifyFailureLeavesANotificationWithRetry() {
        UpdateNotifier.verifyFailed(ctx);

        Notification n = notification(UpdateNotifier.ID_VERIFY_FAILED);
        assertNotNull(n);
        assertEquals("更新包校验没通过", title(n));
        assertEquals(1, n.actions.length);
        assertEquals("重新下载", String.valueOf(n.actions[0].title));
        assertTrue((n.flags & Notification.FLAG_AUTO_CANCEL) != 0);
    }

    @Test
    public void downloadFailureUsesItsOwnNotification() {
        UpdateNotifier.downloadFailed(ctx);

        Notification n = notification(UpdateNotifier.ID_DOWNLOAD_FAILED);
        assertNotNull(n);
        assertEquals("更新包没下成", title(n));
        assertEquals(1, n.actions.length);
    }

    @Test
    public void cancelTakesBothAway() {
        UpdateNotifier.verifyFailed(ctx);
        UpdateNotifier.downloadFailed(ctx);
        assertNotNull(notification(UpdateNotifier.ID_VERIFY_FAILED));

        UpdateNotifier.cancel(ctx);
        assertNull(notification(UpdateNotifier.ID_VERIFY_FAILED));
        assertNull(notification(UpdateNotifier.ID_DOWNLOAD_FAILED));
    }

    /** 「重新下载」那个按钮要落到我们自己的接收器上，不能被别的应用抢走。 */
    @Test
    public void retryActionTargetsOurReceiver() {
        UpdateNotifier.verifyFailed(ctx);
        Notification.Action action = notification(UpdateNotifier.ID_VERIFY_FAILED).actions[0];
        PendingIntent pi = action.actionIntent;
        assertNotNull(pi);

        Intent saved = shadowOf(pi).getSavedIntent();
        assertNotNull(saved);
        assertEquals(UpdateActionReceiver.ACTION, saved.getAction());
        assertEquals(UpdateActionReceiver.OP_RETRY, saved.getStringExtra(UpdateActionReceiver.EXTRA_OP));
        assertEquals(UpdateActionReceiver.class.getName(), saved.getComponent().getClassName());
    }

    @Test
    public void tappingRetryOpensTheAppAndClearsTheNotification() {
        UpdateNotifier.verifyFailed(ctx);

        new UpdateActionReceiver().onReceive(ctx, new Intent(UpdateActionReceiver.ACTION)
                .putExtra(UpdateActionReceiver.EXTRA_OP, UpdateActionReceiver.OP_RETRY));

        Intent started = shadowOf((android.app.Application) ctx).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(MainActivity.class.getName(), started.getComponent().getClassName());
        assertTrue(started.getBooleanExtra(MainActivity.EXTRA_RETRY_UPDATE, false));
        assertNull(notification(UpdateNotifier.ID_VERIFY_FAILED));
    }

    @Test
    public void receiverIgnoresOtherOpsAndActions() {
        new UpdateActionReceiver().onReceive(ctx, new Intent(UpdateActionReceiver.ACTION)
                .putExtra(UpdateActionReceiver.EXTRA_OP, "dance"));
        new UpdateActionReceiver().onReceive(ctx, new Intent("something.else")
                .putExtra(UpdateActionReceiver.EXTRA_OP, UpdateActionReceiver.OP_RETRY));

        assertNull(shadowOf((android.app.Application) ctx).getNextStartedActivity());
    }

    @Test
    public void wantsRetryDownloadOnlyReadsTheExtra() {
        assertTrue(MainActivity.wantsRetryDownload(
                new Intent().putExtra(MainActivity.EXTRA_RETRY_UPDATE, true)));
        assertFalse(MainActivity.wantsRetryDownload(
                new Intent().putExtra(MainActivity.EXTRA_RETRY_UPDATE, false)));
        assertFalse(MainActivity.wantsRetryDownload(new Intent()));
        assertFalse(MainActivity.wantsRetryDownload(null));
    }

    /** 校验没过时一边删包一边留通知，别只剩一个转眼就没的 Toast。 */
    @Test
    public void verifyFailureInTheReceiverLeavesANotification() {
        UpdateInstallReceiver.prefs(ctx).edit()
                .putLong(UpdateInstallReceiver.PREF_ID, 7L)
                .putString(UpdateInstallReceiver.PREF_SHA, "abc")
                .apply();

        UpdateInstallReceiver.finish(ctx, 7L,
                android.net.Uri.parse("content://downloads/all_downloads/7"), false);

        Notification n = notification(UpdateNotifier.ID_VERIFY_FAILED);
        assertNotNull(n);
        assertEquals("更新包校验没通过", title(n));
        assertFalse(UpdateInstallReceiver.prefs(ctx).contains(UpdateInstallReceiver.PREF_ID));
    }

    /** 拿不到文件（下载失败或被取消）也算没下成。 */
    @Test
    public void missingDownloadFilePostsADownloadFailure() {
        UpdateInstallReceiver.prefs(ctx).edit()
                .putLong(UpdateInstallReceiver.PREF_ID, 9L)
                .putString(UpdateInstallReceiver.PREF_SHA, "abc")
                .apply();
        Intent done = new Intent(android.app.DownloadManager.ACTION_DOWNLOAD_COMPLETE)
                .putExtra(android.app.DownloadManager.EXTRA_DOWNLOAD_ID, 9L);

        new UpdateInstallReceiver().onReceive(ctx, done);

        Notification n = notification(UpdateNotifier.ID_DOWNLOAD_FAILED);
        assertNotNull(n);
        assertEquals("更新包没下成", title(n));
        assertFalse(UpdateInstallReceiver.prefs(ctx).contains(UpdateInstallReceiver.PREF_ID));
    }

    /** 别人家的下载完成广播不关我们的事，不该留任何通知。 */
    @Test
    public void foreignDownloadIsIgnored() {
        UpdateInstallReceiver.prefs(ctx).edit().putLong(UpdateInstallReceiver.PREF_ID, 5L).apply();
        Intent done = new Intent(android.app.DownloadManager.ACTION_DOWNLOAD_COMPLETE)
                .putExtra(android.app.DownloadManager.EXTRA_DOWNLOAD_ID, 6L);

        new UpdateInstallReceiver().onReceive(ctx, done);

        assertNull(notification(UpdateNotifier.ID_DOWNLOAD_FAILED));
        assertNull(notification(UpdateNotifier.ID_VERIFY_FAILED));
    }
}
