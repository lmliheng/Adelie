package dev.adelie.app.control;

import static dev.adelie.app.control.FakeScreen.node;
import static dev.adelie.app.control.FakeScreen.row;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 「等界面稳住」（`wait {"until":"still"}`）：不知道下一屏会出现哪段字时，等它不再变，
 * 顺手把这一屏（带编号）交出来，省掉一次 screen。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class WaitStillTest {

    private static JSONObject still(int timeout) throws Exception {
        return new JSONObject().put("until", "still").put("timeout", timeout)
                .put("interval", 100).put("settle", 0);
    }

    @Test
    public void stabilizesWhenTwoReadingsAgree() throws Exception {
        FakeScreen src = new FakeScreen()
                .frame(row(node("加载中", 0, false)))
                .frame(row(node("首页", 0, false), node("搜索", 100, true)))
                .frame(row(node("首页", 0, false), node("搜索", 100, true)));

        JSONObject out = PhoneControl.waitFor(still(3000), src);

        assertTrue(out.getBoolean("ok"));
        assertTrue(out.getBoolean("stable"));
        assertEquals(3, out.getInt("polls"));
        assertEquals(2, out.getInt("nodes"));
        assertTrue(out.getString("text").contains("搜索"));
    }

    @Test
    public void handsBackTheScreenSoTheNextTapHasIndices() throws Exception {
        FakeScreen src = new FakeScreen()
                .frame(row(node("首页", 0, false), node("搜索", 100, true)))
                .frame(row(node("首页", 0, false), node("搜索", 100, true)));

        JSONObject out = PhoneControl.waitFor(still(3000), src);

        // 和 screen 一样的形状：tree 里带编号与边界，拿到就能点
        assertEquals(2, out.getJSONArray("tree").length());
        assertEquals("搜索", out.getJSONArray("tree").getJSONObject(1).getString("text"));
        assertTrue(out.getJSONArray("tree").getJSONObject(1).getBoolean("clickable"));
        assertEquals(4, out.getJSONArray("tree").getJSONObject(1).getJSONArray("bounds").length());
        assertTrue(out.getString("text").contains("[1]"));
    }

    @Test
    public void keepsChangingReportsTheCurrentScreenAnyway() throws Exception {
        FakeScreen src = new FakeScreen();
        for (int i = 0; i < 40; i++) {
            src.frame(row(node(i % 2 == 0 ? "第 1 秒" : "第 2 秒", 0, false)));
        }

        JSONObject out = PhoneControl.waitFor(still(400), src);

        assertTrue(out.getBoolean("ok"));
        assertFalse(out.getBoolean("stable"));
        assertTrue(out.getInt("waited") >= 400);
        assertTrue(out.getString("note").contains("还在变"));
        assertEquals(1, out.getInt("nodes")); // 还是把眼下这一屏给了
    }

    @Test
    public void settleGapMustPassBeforeItCallsItStable() throws Exception {
        FakeScreen src = new FakeScreen();
        for (int i = 0; i < 40; i++) {
            src.frame(row(node("首页", 0, false)));
        }
        JSONObject req = new JSONObject().put("until", "still").put("timeout", 300)
                .put("interval", 100).put("settle", 2000);

        JSONObject out = PhoneControl.waitFor(req, src);

        // 两屏一样，但还没过 settle（也过了 timeout）→ 不算稳
        assertFalse(out.getBoolean("stable"));
    }

    @Test
    public void noWindowIsReportedAsSuch() throws Exception {
        FakeScreen src = new FakeScreen().nothing();

        JSONObject out = PhoneControl.waitFor(still(300), src);

        assertFalse(out.getBoolean("ok"));
        assertEquals("no_window", out.getString("error"));
    }

    @Test
    public void plainWaitIsUnaffectedByTheNewMode() throws Exception {
        FakeScreen src = new FakeScreen();
        JSONObject out = PhoneControl.waitFor(new JSONObject().put("ms", 120), src);
        assertTrue(out.getBoolean("ok"));
        assertFalse(out.has("stable"));
        assertEquals(0, src.calls);
    }
}
