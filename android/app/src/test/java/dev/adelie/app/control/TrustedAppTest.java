package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.lang.reflect.Field;

/**
 * 确认卡上多出来的「以后都允许」：把这个应用记下来，它里面的普通动作（发送、打开应用）
 * 不再弹卡；付款、删除、安装这类做完退不回来的硬边界照样问 —— 「以后都允许」是省点头，
 * 不是把刹车拆了。记下来的应用落盘，重启后还在；设置页能一键清空。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class TrustedAppTest {

    private static final String MM = "com.tencent.mm";
    private Context ctx;
    private Field confirmerField;
    private Object realConfirmer;

    @Before
    public void setUp() throws Exception {
        confirmerField = PhoneControl.class.getDeclaredField("confirmer");
        confirmerField.setAccessible(true);
        realConfirmer = confirmerField.get(null);
        ctx = ApplicationProvider.getApplicationContext();
        PhoneControl.attachContext(ctx);
        PhoneControl.clearTrusted();
        PhoneControl.setDefaultAllowAll(false);
        // 正在操作的应用：收件箱里就是它
        Field f = PhoneControl.class.getDeclaredField("foregroundPackage");
        f.setAccessible(true);
        f.set(null, MM);
    }

    /** 把真的确认通道（浮层）放回去，别把状态漏给别的用例。 */
    @After
    public void tearDown() throws Exception {
        confirmerField.set(null, realConfirmer);
        Field f = PhoneControl.class.getDeclaredField("foregroundPackage");
        f.setAccessible(true);
        f.set(null, "");
        PhoneControl.handle(new JSONObject().put("action", "task").put("op", "stop"));
        PhoneControl.clearTrusted();
    }

    private void session(boolean allowAll) throws Exception {
        PhoneControl.Session s = new PhoneControl.Session();
        s.allowAll = allowAll;
        Field f = PhoneControl.class.getDeclaredField("session");
        f.setAccessible(true);
        f.set(null, s);
    }

    private String reason(String action, String label, String pkg) throws Exception {
        return PhoneControl.confirmReason(action, new JSONObject(), label, pkg);
    }

    @Test
    public void ordinaryActionsAskUntilTheAppIsTrusted() throws Exception {
        assertNotNull(reason("tap", "发送", MM));
        PhoneControl.trustApp(MM);
        assertNull(reason("tap", "发送", MM));
        // 别的应用不受影响
        assertNotNull(reason("tap", "发送", "com.oneplus.filemanager"));
    }

    @Test
    public void irreversiblesStillAskInATrustedApp() throws Exception {
        PhoneControl.trustApp(MM);
        assertTrue(reason("tap", "立即支付", MM).contains("退不回来"));
        assertTrue(reason("tap", "删除聊天", MM).contains("退不回来"));
        assertTrue(reason("tap", "卸载", MM).contains("退不回来"));
    }

    @Test
    public void openingATrustedAppDoesNotAsk() throws Exception {
        JSONObject req = new JSONObject().put("name", "微信");
        assertNotNull(PhoneControl.confirmReason("open", req, null, MM));
        PhoneControl.trustApp(MM);
        assertNull(PhoneControl.confirmReason("open", req, null, MM));
        assertNotNull(PhoneControl.confirmReason("open", req, null, "com.oneplus.filemanager"));
    }

    /** 「本轮免确认」和「以后都允许」是两个开关，叠着也不该把硬边界放过去。 */
    @Test
    public void runWideAllowAllStillRespectsHardBoundaries() throws Exception {
        session(true);
        assertNull(reason("tap", "发送", MM));
        assertTrue(reason("tap", "付款", MM).contains("退不回来"));
    }

    @Test
    public void trustingIsRememberedAcrossRestarts() {
        PhoneControl.clearTrusted();
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .putStringSet("control_trusted_apps",
                        new java.util.HashSet<>(java.util.Arrays.asList(MM)))
                .commit();

        PhoneControl.loadTrusted(ctx);

        assertTrue(PhoneControl.trusted(MM));
        assertEquals(1, PhoneControl.trustedCount());
        assertFalse(PhoneControl.trusted("com.oneplus.filemanager"));
    }

    @Test
    public void clearingRemovesTheMemoryAndThePreference() {
        PhoneControl.trustApp(MM);
        assertTrue(PhoneControl.trusted(MM));

        PhoneControl.clearTrusted();

        assertFalse(PhoneControl.trusted(MM));
        assertEquals(0, PhoneControl.trustedCount());
        java.util.Set<String> saved = ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE)
                .getStringSet("control_trusted_apps", null);
        assertTrue(saved == null || saved.isEmpty());
    }

    /** 点了「以后都允许」：这一步照样做（ONCE），同时把应用记下来。 */
    @Test
    public void trustAnswerExecutesTheStepAndRemembersTheApp() throws Exception {
        confirmerField.set(null, new PhoneControl.Confirmer() {
            @Override
            public ControlOverlay.Answer ask(String reason) {
                return ControlOverlay.Answer.TRUST;
            }
        });
        assertEquals(ControlOverlay.Answer.ONCE, PhoneControl.ask("要点「发送」"));
        assertTrue(PhoneControl.trusted(MM));
        assertEquals(1, PhoneControl.trustedCount());
    }

    /** 没有可操作的应用（前台包为空）时，点「以后都允许」也只是放行这一步，不记脏数据。 */
    @Test
    public void trustWithoutForegroundAppRecordsNothing() throws Exception {
        Field f = PhoneControl.class.getDeclaredField("foregroundPackage");
        f.setAccessible(true);
        f.set(null, "");
        confirmerField.set(null, new PhoneControl.Confirmer() {
            @Override
            public ControlOverlay.Answer ask(String reason) {
                return ControlOverlay.Answer.TRUST;
            }
        });
        assertEquals(ControlOverlay.Answer.ONCE, PhoneControl.ask("要点「发送」"));
        assertEquals(0, PhoneControl.trustedCount());
    }
}
