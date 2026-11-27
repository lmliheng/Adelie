package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 通知栏进度：任务在跑的时候要有一条安静的通知，带「暂停 / 免确认 / 停止」三个按钮，
 * 每个按钮都真的能改状态，任务结束通知要收走。
 *
 * <p>按钮点击在这里直接调接收器（PendingIntent 的落点），真机上点通知栏是同一段代码。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class TaskNotificationTest {

    private Context ctx;
    private NotificationManager nm;

    @Before
    public void setUp() throws Exception {
        ctx = ApplicationProvider.getApplicationContext();
        PhoneControl.attachContext(ctx);
        nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        // 上一个用例可能留着会话
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "stop"));
        nm.cancelAll();
    }

    @After
    public void tearDown() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "stop"));
    }

    private Notification notification() {
        return shadowOf(nm).getNotification(TaskNotification.NOTIFICATION_ID);
    }

    private void tap(String op) {
        new ControlActionReceiver().onReceive(ctx, new Intent(ControlActionReceiver.ACTION_TASK)
                .putExtra(ControlActionReceiver.EXTRA_OP, op));
    }

    private String title() {
        Notification n = notification();
        assertNotNull(n);
        return String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TITLE));
    }

    private String text() {
        Notification n = notification();
        assertNotNull(n);
        return String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TEXT));
    }

    @Test
    public void startingATaskPostsAnOngoingNotificationWithThreeActions() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        assertTrue(out.getBoolean("running"));

        Notification n = notification();
        assertNotNull(n);
        assertEquals("Adelie 正在操作手机", title());
        assertEquals("任务开始", text());
        assertTrue((n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertEquals(3, n.actions.length);
        assertEquals("暂停", String.valueOf(n.actions[0].title));
        assertEquals("免确认", String.valueOf(n.actions[1].title));
        assertEquals("停止", String.valueOf(n.actions[2].title));
        assertTrue(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    }

    /** 人在别的应用里忙的时候，点一下「免确认」，这一轮剩下的动作就不再弹确认卡。 */
    @Test
    public void allowButtonTurnsOffConfirmationsForThisRun() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("allow");

        JSONObject status = PhoneControl.handle(new JSONObject().put("action", "task").put("op", "status"));
        assertTrue(status.getBoolean("allowAll"));
        Notification n = notification();
        assertNotNull(n);
        assertEquals("恢复确认", String.valueOf(n.actions[1].title));
        assertTrue(String.valueOf(n.extras.getCharSequence(Notification.EXTRA_SUB_TEXT))
                .contains("已免确认"));
    }

    @Test
    public void allowButtonTogglesBack() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("allow");
        tap("allow");

        JSONObject status = PhoneControl.handle(new JSONObject().put("action", "task").put("op", "status"));
        assertFalse(status.getBoolean("allowAll"));
        Notification n = notification();
        assertNotNull(n);
        assertEquals("免确认", String.valueOf(n.actions[1].title));
    }

    /** 免确认只属于这一轮：任务结束下一轮重新开始，还是要点头。 */
    @Test
    public void allowStateDoesNotLeakIntoTheNextRun() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("allow");
        tap("stop");
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));

        JSONObject status = PhoneControl.handle(new JSONObject().put("action", "task").put("op", "status"));
        assertFalse(status.getBoolean("allowAll"));
    }

    @Test
    public void allowButtonWithoutTaskIsHarmless() {
        tap("allow");
        assertFalse(PhoneControl.sessionAlive());
        assertNull(notification());
    }

    @Test
    public void pauseButtonPausesAndSwapsTheLabel() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("pause");

        assertTrue(PhoneControl.isPaused());
        assertEquals("Adelie 已暂停", title());
        Notification n = notification();
        assertNotNull(n);
        assertEquals("继续", String.valueOf(n.actions[0].title));
        // 暂停时不再走秒表
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    }

    @Test
    public void pauseButtonTogglesBack() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("pause");
        tap("pause");

        assertFalse(PhoneControl.isPaused());
        assertEquals("Adelie 正在操作手机", title());
    }

    @Test
    public void stopButtonEndsTheTaskAndCancelsTheNotification() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("stop");

        assertFalse(PhoneControl.sessionAlive());
        assertNull(notification());
    }

    @Test
    public void endingTheTaskHidesTheNotification() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        assertNotNull(notification());

        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "stop"));
        assertNull(notification());
    }

    @Test
    public void unknownOpIsIgnored() throws Exception {
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        tap("dance");

        assertTrue(PhoneControl.sessionAlive());
        assertFalse(PhoneControl.isPaused());
    }
}
