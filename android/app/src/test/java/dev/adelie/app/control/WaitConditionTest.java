package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

/**
 * 「等界面」：等关键字出现、等它消失、等前台换应用。
 *
 * <p>真机上读屏要无障碍服务，这里把「每次轮询看到的那一屏」换成脚本，逻辑一样走：
 * 命中要早停、超时要说清楚等了几秒、读不到窗口不能误判成「它走了」。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class WaitConditionTest {

    /** 每次轮询换一屏；脚本用完之后一直给最后一屏。 */
    private static final class Script implements PhoneControl.ScreenSource {
        private final LinkedList<List<AccessibilityNodeInfo>> frames = new LinkedList<>();
        private final LinkedList<String> foregrounds = new LinkedList<>();
        private List<AccessibilityNodeInfo> last = new ArrayList<>();
        private String foreground = "";
        int calls;

        Script frame(List<AccessibilityNodeInfo> frame) {
            frames.add(frame);
            last = frame;
            return this;
        }

        Script nothing() {
            frames.add(null);
            return this;
        }

        Script foreground(String pkg) {
            foregrounds.add(pkg);
            return this;
        }

        @Override
        public List<AccessibilityNodeInfo> snapshot() {
            calls++;
            if (!frames.isEmpty()) last = frames.removeFirst();
            return last;
        }

        @Override
        public String foreground() {
            if (!foregrounds.isEmpty()) foreground = foregrounds.removeFirst();
            return foreground;
        }
    }

    private static AccessibilityNodeInfo node(String text, int top, boolean clickable) {
        AccessibilityNodeInfo n = AccessibilityNodeInfo.obtain();
        n.setText(text);
        n.setClassName("android.widget.TextView");
        n.setClickable(clickable);
        n.setBoundsInScreen(new Rect(0, top, 400, top + 80));
        return n;
    }

    private static List<AccessibilityNodeInfo> screen(AccessibilityNodeInfo... nodes) {
        List<AccessibilityNodeInfo> list = new ArrayList<>();
        for (AccessibilityNodeInfo n : nodes) list.add(n);
        return list;
    }

    private static JSONObject wait(JSONObject req, PhoneControl.ScreenSource src) throws Exception {
        return PhoneControl.waitFor(req, src);
    }

    @Test
    public void stopsAsSoonAsTheTextShowsUp() throws Exception {
        Script src = new Script()
                .frame(screen(node("聊天", 0, false)))
                .frame(screen(node("聊天", 0, false), node("发送中", 200, false)))
                .frame(screen(node("聊天", 0, false), node("已发送", 200, false)));
        JSONObject req = new JSONObject().put("text", "已发送").put("timeout", 3000).put("interval", 100);

        JSONObject out = wait(req, src);

        assertTrue(out.getBoolean("ok"));
        assertTrue(out.getBoolean("found"));
        assertEquals(3, out.getInt("polls"));
        assertEquals(3, src.calls); // 命中了就不再读屏
        assertEquals("已发送", out.getJSONObject("hit").getString("text"));
        assertTrue(out.getString("note").contains("screen"));
    }

    @Test
    public void matchingIsContainLikeTap() throws Exception {
        Script src = new Script().frame(screen(node("已发送", 0, false)));
        JSONObject out = wait(new JSONObject().put("text", "发送").put("timeout", 500), src);
        assertTrue(out.getBoolean("found"));
    }

    @Test
    public void exactOnlyMatchesWholeText() throws Exception {
        Script src = new Script().frame(screen(node("已发送", 0, false)));
        JSONObject out = wait(new JSONObject().put("text", "发送").put("exact", true)
                .put("timeout", 300).put("interval", 100), src);
        assertFalse(out.getBoolean("found"));
        assertTrue(out.getString("note").contains("没等到"));
    }

    @Test
    public void timeoutSaysHowLongItWaited() throws Exception {
        Script src = new Script().frame(screen(node("聊天", 0, false)));
        src.foreground("com.tencent.mm");
        JSONObject out = wait(new JSONObject().put("text", "已发送")
                .put("timeout", 400).put("interval", 100), src);

        assertTrue(out.getBoolean("ok")); // 没等到不是错
        assertFalse(out.getBoolean("found"));
        assertTrue(out.getInt("waited") >= 400);
        assertTrue(out.getInt("polls") >= 2);
        assertTrue(out.getString("note").contains("没等到"));
        assertEquals("com.tencent.mm", out.getString("foreground"));
    }

    @Test
    public void goneReturnsWhenTheSpinnerDisappears() throws Exception {
        Script src = new Script()
                .frame(screen(node("加载中", 0, false)))
                .frame(screen(node("加载中", 0, false)))
                .frame(screen(node("已发送", 0, false)));
        JSONObject req = new JSONObject().put("text", "加载中").put("gone", true)
                .put("timeout", 3000).put("interval", 100);

        JSONObject out = wait(req, src);

        assertTrue(out.getBoolean("found"));
        assertTrue(out.getBoolean("gone"));
        assertEquals(3, src.calls);
        assertTrue(out.getString("note").contains("已经不在了"));
    }

    @Test
    public void goneTimesOutWhileItIsStillThere() throws Exception {
        Script src = new Script().frame(screen(node("加载中", 0, false)));
        JSONObject out = wait(new JSONObject().put("text", "加载中").put("gone", true)
                .put("timeout", 300).put("interval", 100), src);

        assertFalse(out.getBoolean("found"));
        assertTrue(out.getString("note").contains("还在"));
    }

    @Test
    public void waitsForAnotherAppToComeToFront() throws Exception {
        Script src = new Script();
        src.foreground("dev.adelie.app");
        src.foreground("dev.adelie.app");
        src.foreground("com.tencent.mm");

        JSONObject out = wait(new JSONObject().put("package", "com.tencent.mm")
                .put("timeout", 3000).put("interval", 100), src);

        assertTrue(out.getBoolean("found"));
        assertEquals("com.tencent.mm", out.getJSONObject("hit").getString("package"));
    }

    @Test
    public void appNeverCameToFront() throws Exception {
        Script src = new Script();
        src.foreground("dev.adelie.app");

        JSONObject out = wait(new JSONObject().put("package", "com.tencent.mm")
                .put("timeout", 300).put("interval", 100), src);

        assertFalse(out.getBoolean("found"));
        assertEquals("dev.adelie.app", out.getString("foreground"));
    }

    @Test
    public void unreadableWindowIsNotTakenAsGone() throws Exception {
        Script src = new Script().nothing();
        JSONObject out = wait(new JSONObject().put("text", "加载中").put("gone", true)
                .put("timeout", 300).put("interval", 100), src);

        assertFalse(out.getBoolean("found"));
        assertTrue(out.getString("note").contains("没拿到当前窗口"));
    }

    @Test
    public void timeoutIsClampedToTheMinimum() throws Exception {
        Script src = new Script().frame(screen(node("聊天", 0, false)));
        JSONObject out = wait(new JSONObject().put("text", "已发送").put("timeout", 1), src);

        assertFalse(out.getBoolean("found"));
        assertTrue(out.getInt("waited") >= PhoneControl.WAIT_MIN_MS);
    }

    @Test
    public void withoutConditionItJustSleeps() throws Exception {
        Script src = new Script();
        JSONObject out = wait(new JSONObject().put("ms", 120), src);

        assertTrue(out.getBoolean("ok"));
        assertFalse(out.has("found"));
        assertEquals(0, src.calls); // 纯等不读屏
        assertTrue(out.getInt("waited") >= 120);
    }

    @Test
    public void hitCarriesLabelAndBoundsForTheNextTap() throws Exception {
        AccessibilityNodeInfo n = node("已发送", 320, true);
        Script src = new Script().frame(screen(n));
        JSONObject out = wait(new JSONObject().put("text", "已发送").put("timeout", 500), src);

        JSONObject hit = out.getJSONObject("hit");
        assertNotNull(hit);
        assertEquals("android.widget.TextView", hit.getString("class"));
        assertTrue(hit.getBoolean("clickable"));
        assertEquals(4, hit.getJSONArray("bounds").length());
        assertEquals(320, hit.getJSONArray("bounds").getInt(1));
    }
}
