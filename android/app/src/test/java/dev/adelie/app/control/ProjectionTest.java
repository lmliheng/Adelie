package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 后台屏的协议面：没授权时不能假装有画面，也不能让调用方以为成功了。
 * 真正的 MediaProjection 授权与虚拟显示只能在真机上验（这里没有设备），
 * 所以把「没授权时说什么」锁死 —— 这是唯一能在这台机器上验证的部分。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ProjectionTest {

    @Test
    public void statusWithoutConsentIsHonest() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "projection"));
        assertTrue(out.getBoolean("ok"));
        assertFalse(out.getBoolean("active"));
        assertEquals(-1, out.getInt("display"));
    }

    @Test
    public void captureWithoutConsentSaysProjectionOff() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "capture"));
        assertFalse(out.getBoolean("ok"));
        assertEquals("projection_off", out.getString("error"));
    }

    @Test
    public void virtualScreenWithoutConsentExplainsTheNextStep() throws Exception {
        JSONObject req = new JSONObject().put("action", "screen").put("display", "virtual");
        JSONObject out = PhoneControl.handle(req);
        assertFalse(out.getBoolean("ok"));
        // 没有无障碍服务时先报 accessibility_off；开了之后才会走到 no_virtual_window
        assertTrue("accessibility_off".equals(out.getString("error"))
                || "no_virtual_window".equals(out.getString("error")));
    }

    @Test
    public void launchWithoutConsentIsRefused() throws Exception {
        JSONObject req = new JSONObject().put("action", "projection")
                .put("op", "launch").put("package", "com.tencent.mm");
        JSONObject out = PhoneControl.handle(req);
        assertFalse(out.getBoolean("ok"));
        assertEquals("projection_off", out.getString("error"));
    }

    @Test
    public void stopIsIdempotent() throws Exception {
        JSONObject out = PhoneControl.handle(
                new JSONObject().put("action", "projection").put("op", "stop"));
        assertTrue(out.getBoolean("ok"));
        assertFalse(out.getBoolean("active"));
    }
}
