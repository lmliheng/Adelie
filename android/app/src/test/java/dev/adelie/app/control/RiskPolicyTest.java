package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 「这一步要不要先问人」的判定，以及没开无障碍时确认卡的行为。
 * 真正的确认卡在真机上是系统浮层，这里只锁规则 —— 规则错了要么乱点，要么把人烦死。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RiskPolicyTest {

    @Test
    public void sendingAndDeletingNeedAYes() {
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "发送").contains("发送"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "删除聊天").contains("删除"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "立即支付").contains("支付"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "卸载").contains("卸载"));
    }

    @Test
    public void plainBrowsingDoesNotAsk() {
        assertNull(RiskPolicy.reason("tap", new JSONObject(), "设置"));
        assertNull(RiskPolicy.reason("tap", new JSONObject(), "返回"));
        assertNull(RiskPolicy.reason("swipe", new JSONObject(), "滑动"));
        assertNull(RiskPolicy.reason("screen", new JSONObject(), null));
    }

    @Test
    public void targetTextFromRequestCountsToo() throws Exception {
        JSONObject req = new JSONObject().put("text", "确认删除");
        assertTrue(RiskPolicy.reason("tap", req, null).contains("确认删除"));
    }

    @Test
    public void openingAnAppAlwaysAsks() throws Exception {
        JSONObject req = new JSONObject().put("name", "微信");
        assertEquals("要打开「微信」", RiskPolicy.reason("open", req, null));
    }

    /** 免确认管的是「要不要为发送、开应用这种事点头」；付款、删除、安装照样问。 */
    @Test
    public void allowAllSkipsOrdinaryButNotIrreversible() throws Exception {
        assertNull(RiskPolicy.reason("tap", new JSONObject(), "发送", true));
        assertNull(RiskPolicy.reason("tap", new JSONObject(), "确定", true));
        assertNull(RiskPolicy.reason("open", new JSONObject().put("name", "微信"), null, true));

        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "立即支付", true).contains("支付"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "转账给张三", true).contains("转账"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "删除聊天", true).contains("删除"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "卸载", true).contains("卸载"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "清空记录", true).contains("清空"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "退出登录", true).contains("退出登录"));
    }

    @Test
    public void withoutAllowAllEverythingAsksAsBefore() {
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "发送", false).contains("发送"));
        assertTrue(RiskPolicy.reason("tap", new JSONObject(), "支付", false).contains("支付"));
        assertNull(RiskPolicy.reason("tap", new JSONObject(), "设置", false));
    }

    @Test
    public void hardReasonOnlyCoversIrreversibleWords() {
        assertNull(RiskPolicy.hardReason("tap", new JSONObject(), "发送"));
        assertNull(RiskPolicy.hardReason("swipe", new JSONObject(), "删除"));
        assertTrue(RiskPolicy.hardReason("tap", new JSONObject(), "付款").contains("退不回来"));
    }

    @Test
    public void withoutAccessibilityConfirmationFallsBackToCancel() {
        // 没有无障碍服务就没有浮层，不能假装用户同意了
        assertEquals(ControlOverlay.Answer.CANCEL, ControlOverlay.confirm("要点「发送」"));
    }
}
