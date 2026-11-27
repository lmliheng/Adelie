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
 * 「滑着找」（`scroll_to`）：一屏一屏往后翻，找到就把这一屏的编号交出来，滑到上限就老实说没找到。
 *
 * <p>手势换成假的（记下被叫了几次、朝哪个方向），找的逻辑一样走。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ScrollToTest {

    /** 记下每次滑动：朝哪边、被叫了多少次。 */
    private static final class Scrolls implements PhoneControl.ScrollRunner {
        int count;
        boolean up;
        boolean accept = true;

        @Override
        public boolean scroll(boolean up) {
            count++;
            this.up = up;
            return accept;
        }
    }

    private static JSONObject look(String text, int max) throws Exception {
        return new JSONObject().put("text", text).put("max", max);
    }

    @Test
    public void findsItAfterScrollingTwoScreens() throws Exception {
        FakeScreen src = new FakeScreen()
                .frame(row(node("张三", 0, true)))
                .frame(row(node("李四", 0, true)))
                .frame(row(node("王五", 0, true)));
        Scrolls scrolls = new Scrolls();

        JSONObject out = PhoneControl.scrollTo(look("王五", 4), src, scrolls);

        assertTrue(out.getBoolean("found"));
        assertEquals(2, out.getInt("scrolled"));
        assertEquals(2, scrolls.count);
        assertEquals(0, out.getInt("index")); // 第三屏只有这一个控件，编号是这一屏的 0
        assertEquals("王五", out.getJSONObject("hit").getString("text"));
    }

    @Test
    public void givesUpAfterMaxScreens() throws Exception {
        FakeScreen src = new FakeScreen()
                .frame(row(node("张三", 0, true)))
                .frame(row(node("李四", 0, true)))
                .frame(row(node("赵六", 0, true)));
        Scrolls scrolls = new Scrolls();

        JSONObject out = PhoneControl.scrollTo(look("王五", 2), src, scrolls);

        assertFalse(out.getBoolean("found"));
        assertEquals(2, out.getInt("scrolled"));
        assertEquals(2, scrolls.count);
        assertTrue(out.getString("note").contains("没找到"));
    }

    @Test
    public void findsItWithoutScrollingWhenItIsAlreadyThere() throws Exception {
        FakeScreen src = new FakeScreen().frame(row(node("张三", 0, true), node("王五", 100, true)));
        Scrolls scrolls = new Scrolls();

        JSONObject out = PhoneControl.scrollTo(look("王五", 4), src, scrolls);

        assertTrue(out.getBoolean("found"));
        assertEquals(0, out.getInt("scrolled"));
        assertEquals(1, out.getInt("index"));
        assertEquals(0, scrolls.count);
    }

    @Test
    public void directionIsPassedToTheGesture() throws Exception {
        FakeScreen src = new FakeScreen()
                .frame(row(node("张三", 0, true)))
                .frame(row(node("王五", 0, true)));
        Scrolls scrolls = new Scrolls();

        JSONObject req = look("王五", 4).put("dir", "up");
        JSONObject out = PhoneControl.scrollTo(req, src, scrolls);

        assertTrue(out.getBoolean("found"));
        assertTrue(scrolls.up);
    }

    @Test
    public void refusedGestureStopsInsteadOfLooping() throws Exception {
        FakeScreen src = new FakeScreen()
                .frame(row(node("张三", 0, true)))
                .frame(row(node("王五", 0, true)));
        Scrolls scrolls = new Scrolls();
        scrolls.accept = false;

        JSONObject out = PhoneControl.scrollTo(look("王五", 4), src, scrolls);

        assertFalse(out.getBoolean("ok"));
        assertEquals("gesture_failed", out.getString("error"));
        assertEquals(1, scrolls.count);
    }

    @Test
    public void needsSomethingToLookFor() throws Exception {
        FakeScreen src = new FakeScreen().frame(row(node("张三", 0, true)));
        JSONObject out = PhoneControl.scrollTo(new JSONObject(), src, new Scrolls());

        assertFalse(out.getBoolean("ok"));
        assertEquals("bad_request", out.getString("error"));
    }

    @Test
    public void noWindowIsReportedAsSuch() throws Exception {
        FakeScreen src = new FakeScreen().nothing();
        JSONObject out = PhoneControl.scrollTo(look("王五", 4), src, new Scrolls());

        assertFalse(out.getBoolean("ok"));
        assertEquals("no_window", out.getString("error"));
    }

    @Test
    public void maxIsCappedSoItCannotScrollForever() throws Exception {
        FakeScreen src = new FakeScreen();
        for (int i = 0; i < 40; i++) src.frame(row(node("第 " + i + " 屏", 0, true)));
        Scrolls scrolls = new Scrolls();

        JSONObject out = PhoneControl.scrollTo(look("王五", 999), src, scrolls);

        assertFalse(out.getBoolean("found"));
        assertEquals(PhoneControl.SCROLL_MAX, out.getInt("scrolled"));
        assertEquals(PhoneControl.SCROLL_MAX, scrolls.count);
    }
}
