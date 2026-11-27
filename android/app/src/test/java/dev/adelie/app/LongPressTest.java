package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import dev.adelie.app.control.PhoneControl;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.Charset;

/**
 * 长按（`long_press`）与输入法回车（`key enter`）这两个动作：它们的意义是「模型能碰到原本碰不到的界面」——
 * 菜单藏在长按里、搜索框只能按输入法上的回车。
 *
 * <p>真机上叫不叫得出菜单只有手机说得准；这里锁住能锁的部分：动作被认、别名不走错、
 * 时长挡在合理区间、没有无障碍时老实报错，以及技能文档与协议不脱节。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class LongPressTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private JSONObject call(String action) throws Exception {
        return PhoneControl.handle(new JSONObject().put("action", action));
    }

    @Test
    public void longPressIsAKnownAction() throws Exception {
        for (String name : new String[]{"long_press", "longpress", "long"}) {
            JSONObject out = call(name);
            // 认得这个动作才会走到「无障碍没开」这一步；不认得会回 bad_request
            assertFalse(name, out.getBoolean("ok"));
            assertEquals(name, "accessibility_off", out.getString("error"));
        }
    }

    @Test
    public void unknownActionStillRejected() throws Exception {
        assertEquals("bad_request", call("long_pressss").getString("error"));
    }

    @Test
    public void enterKeyDoesNotExplodeWithoutAccessibility() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject()
                .put("action", "key").put("name", "enter"));
        assertFalse(out.getBoolean("ok"));
        assertEquals("accessibility_off", out.getString("error"));
    }

    @Test
    public void longPressDurationIsClamped() throws Exception {
        assertEquals(800, PhoneControl.longPressMs(null));
        assertEquals(800, PhoneControl.longPressMs(new JSONObject()));
        assertEquals(1200, PhoneControl.longPressMs(new JSONObject().put("duration", 1200)));
        // 太短会被系统当成点击，太长像卡住
        assertEquals(400, PhoneControl.longPressMs(new JSONObject().put("duration", 10)));
        assertEquals(5000, PhoneControl.longPressMs(new JSONObject().put("duration", 99999)));
    }

    @Test
    public void labelReadsAsLongPressInTheJournal() {
        assertEquals("长按", PhoneControl.label("long_press"));
        assertEquals("长按", PhoneControl.label("long"));
    }

    @Test
    public void helpMentionsLongPressAndEnter() throws Exception {
        String help = call("help").getString("help");
        assertTrue(help.contains("long_press"));
        assertTrue(help.contains("enter"));
    }

    /**
     * 技能文档跟协议不能脱节：模型只看得见 doc 里写的东西，动作加了而文档没写，等于没加。
     */
    @Test
    public void skillDocListsEveryAction() throws Exception {
        Context ctx = ApplicationProvider.getApplicationContext();
        String doc = readAsset(ctx, "phone-skill.md");
        String[] actions = {"screen", "tap", "swipe", "long_press", "text", "key", "open",
                "apps", "screenshot", "wait", "task", "journal", "projection", "capture"};
        for (String action : actions) {
            assertTrue("技能文档里少了动作 " + action, doc.contains(action));
        }
        assertTrue("文档要说明 key enter 是输入法的回车", doc.contains("enter"));
        assertTrue(doc.contains("ACTION_IME_ENTER") || doc.contains("输入法的回车"));

        String cli = readAsset(ctx, "phone.js");
        assertTrue("随包的命令行用法里也要有 long_press", cli.contains("long_press"));
    }

    private String readAsset(Context ctx, String name) throws Exception {
        try (InputStream in = ctx.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), UTF8);
        }
    }
}
