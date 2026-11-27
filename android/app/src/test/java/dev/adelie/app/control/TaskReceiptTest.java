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
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * 任务结束后的「回执」：进度通知收走之后，通知栏还留着一条安静的小结（几步、几次没成、在哪个应用），
 * 点开直接进这一轮的回放。一步都没做的那一轮不留东西。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class TaskReceiptTest {

    private Context ctx;
    private NotificationManager nm;

    @Before
    public void setUp() throws Exception {
        ctx = ApplicationProvider.getApplicationContext();
        PhoneControl.attachContext(ctx);
        nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "stop"));
        nm.cancelAll();
    }

    /** 直接摆一个「已经做过 N 步」的会话，不用真去操作无障碍节点。 */
    private PhoneControl.Session session(int steps, int failed, String app) throws Exception {
        PhoneControl.Session s = new PhoneControl.Session();
        s.step = steps;
        s.failed = failed;
        s.lastApp = app;
        Field f = PhoneControl.class.getDeclaredField("session");
        f.setAccessible(true);
        f.set(null, s);
        return s;
    }

    private Notification receipt() {
        return shadowOf(nm).getNotification(TaskNotification.RECEIPT_ID);
    }

    private String title(Notification n) {
        return String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TITLE));
    }

    private String text(Notification n) {
        return String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TEXT));
    }

    @Test
    public void cleanRunSaysItFinished() {
        assertEquals("这一轮操作完成了", TaskNotification.receiptTitle(0));
        assertEquals("7 步 · 微信", TaskNotification.receiptText(7, 0, "微信"));
    }

    @Test
    public void failedRunPutsTheCountInTheTitle() {
        assertEquals("这一轮有 2 步没成", TaskNotification.receiptTitle(2));
        assertEquals("7 步 · 2 次失败 · 微信", TaskNotification.receiptText(7, 2, "微信"));
    }

    @Test
    public void withoutAnAppTheTailIsDropped() {
        assertEquals("3 步", TaskNotification.receiptText(3, 0, ""));
        assertEquals("3 步", TaskNotification.receiptText(3, 0, null));
    }

    @Test
    public void endingARunLeavesTheReceipt() throws Exception {
        session(7, 1, "微信");
        PhoneControl.endSession("任务结束");

        Notification n = receipt();
        assertNotNull(n);
        assertEquals("这一轮有 1 步没成", title(n));
        assertEquals("7 步 · 1 次失败 · 微信", text(n));
        assertTrue((n.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        // 进度通知跟着收走，只留回执
        assertNull(shadowOf(nm).getNotification(TaskNotification.NOTIFICATION_ID));
    }

    @Test
    public void receiptOpensTheJournal() throws Exception {
        session(2, 0, "微信");
        PhoneControl.endSession("任务结束");

        Notification n = receipt();
        assertNotNull(n);
        Intent saved = shadowOf(n.contentIntent).getSavedIntent();
        assertEquals(dev.adelie.app.MainActivity.class.getName(), saved.getComponent().getClassName());
        assertTrue(saved.getBooleanExtra(dev.adelie.app.MainActivity.EXTRA_OPEN_JOURNAL, false));
    }

    /** 只开了个任务头又停掉（一步都没做）不值得在通知栏里留东西。 */
    @Test
    public void arunWithoutStepsLeavesNothing() throws Exception {
        session(0, 0, "");
        PhoneControl.endSession("任务结束");
        assertNull(receipt());
    }

    /** 下一轮开始，上一轮的回执就该消失，别在通知栏里越堆越多。 */
    @Test
    public void newRunClearsTheOldReceipt() throws Exception {
        session(3, 0, "微信");
        PhoneControl.endSession("任务结束");
        assertNotNull(receipt());

        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "start"));
        assertNull(receipt());
    }

    /** 回执里的「N 步没成」和日志里的 ok 是同一份判断：失败才计数，成功不动。 */
    @Test
    public void failuresAreCountedWhenTheStepIsRecorded() throws Exception {
        PhoneControl.Session s = session(1, 0, "微信");
        Method record = PhoneControl.class.getDeclaredMethod("record", String.class, JSONObject.class);
        record.setAccessible(true);

        record.invoke(null, "tap", new JSONObject().put("ok", true));
        assertEquals(0, s.failed);

        record.invoke(null, "tap", new JSONObject().put("ok", false).put("error", "not_found"));
        assertEquals(1, s.failed);
    }

    @Test
    public void receiptWithoutContextIsHarmless() throws Exception {
        // 服务没起来也没有应用上下文时：什么都不发，也不能崩
        Field c = PhoneControl.class.getDeclaredField("appContext");
        c.setAccessible(true);
        Object saved = c.get(null);
        c.set(null, null);
        try {
            TaskNotification.receipt(3, 1, "微信");
            TaskNotification.hideReceipt();
        } finally {
            c.set(null, saved);
        }
        assertNull(receipt());
        assertFalse(PhoneControl.sessionAlive());
    }
}
