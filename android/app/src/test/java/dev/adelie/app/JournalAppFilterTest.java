package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;

import dev.adelie.app.control.PhoneControl;

/**
 * 回放页的「只看某个应用」：日志里混着微信、文件管理器的步骤时，人只想知道
 * 「刚才在那个应用里到底点了什么」。这个筛选必须只影响列表，不影响该应用的真实步数；
 * 而且它是叠在「只看失败 / 最近一轮」之外的第二个维度，能一起用。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalAppFilterTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String MM = "com.tencent.mm";
    private static final String FILES = "com.oneplus.filemanager";

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        PhoneControl.clearJournal(ctx);
    }

    private void seed(MainActivity a) throws Exception {
        File dir = new File(a.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        long t = 1_700_000_000_000L;
        long first = t;
        long second = t + 3 * 25_000L + 90_000L;   // 两轮之间隔一分半
        String[][] rows = {
                {MM, "读屏", "读屏", "ok", ""},
                {MM, "点按", "点「搜索」", "ok", ""},
                {MM, "输入文字", "输入「明天下午三点」", "ok", ""},
                {MM, "点按", "点「发送」", "fail", "not_found"},
                {FILES, "打开应用", "打开「文件管理」", "ok", ""},
                {FILES, "截图", "截图", "ok", ""},
                {FILES, "分享", "分享到微信", "fail", "denied"},
        };
        try (OutputStream out = new FileOutputStream(file, false)) {
            for (int i = 0; i < rows.length; i++) {
                JSONObject o = new JSONObject();
                o.put("t", t);
                o.put("action", rows[i][1]);
                o.put("step", rows[i][2]);
                o.put("ok", "ok".equals(rows[i][3]));
                o.put("foreground", rows[i][0]);
                o.put("task", i < 4 ? first : second);
                if (!rows[i][4].isEmpty()) o.put("error", rows[i][4]);
                out.write((o.toString() + "\n").getBytes(UTF8));
                t += 25_000L;
            }
        }
    }

    private ActivityController<MainActivity> launch() {
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ShadowLooper.idleMainLooper();
        return c;
    }

    private String subtitle(MainActivity a) {
        return ((TextView) a.findViewById(R.id.journal_subtitle)).getText().toString();
    }

    /** body 里所有文字拼起来，用「看得见 / 看不见某一步」来断言行有没有被筛掉。 */
    private List<String> texts(View root) {
        List<String> out = new ArrayList<>();
        if (root instanceof TextView) {
            CharSequence v = ((TextView) root).getText();
            if (v != null) out.add(v.toString());
        }
        if (root instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) root;
            for (int i = 0; i < g.getChildCount(); i++) out.addAll(texts(g.getChildAt(i)));
        }
        return out;
    }

    private String bodyText(MainActivity a) {
        return String.join("\n", texts(a.findViewById(R.id.journal_body)));
    }

    @Test
    public void everythingShowsUntilAnAppIsPicked() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals(View.GONE, a.findViewById(R.id.journal_app_row).getVisibility());
        assertEquals("7 条 · 2 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertTrue(body.contains("分享到微信"));
    }

    @Test
    public void filterKeepsOnlyThatAppsSteps() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByApp(MM);
        ShadowLooper.idleMainLooper();

        assertEquals(View.VISIBLE, a.findViewById(R.id.journal_app_row).getVisibility());
        com.google.android.material.chip.Chip chip = a.findViewById(R.id.journal_chip_app);
        assertEquals("只看 " + MM, chip.getText().toString());
        // 条数是这个应用自己的，不是整份日志的
        assertEquals("只看 " + MM + " · 4 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertFalse(body.contains("分享到微信"));
        assertFalse(body.contains(FILES));
    }

    /** 点 chip 本体就取消（✕ 走的是同一个方法，这里点按整颗 chip 已经覆盖了那条路径）。 */
    @Test
    public void tappingTheChipClearsTheAppFilter() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByApp(MM);
        a.findViewById(R.id.journal_chip_app).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(View.GONE, a.findViewById(R.id.journal_app_row).getVisibility());
        assertEquals("7 条 · 2 次失败", subtitle(a));
        assertTrue(bodyText(a).contains("分享到微信"));
    }

    /** 应用筛选叠「只看失败」：只剩这个应用里翻车的那几步，标题仍写着这个应用的真实步数。 */
    @Test
    public void combinesWithTheFailedFilter() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByApp(MM);
        a.findViewById(R.id.journal_chip_failed).performClick();
        ShadowLooper.idleMainLooper();

        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertFalse(body.contains("点「搜索」"));
        assertFalse(body.contains("分享到微信"));
        assertTrue(subtitle(a).endsWith(" · 4 步 · 1 次失败"));
    }

    /** 关掉回放页就把筛选清掉：下次进来先看到全部，不被上次的筛选困住。 */
    @Test
    public void closingThePageResetsTheFilter() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByApp(FILES);
        a.showJournal(false);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals(View.GONE, a.findViewById(R.id.journal_app_row).getVisibility());
        assertEquals("7 条 · 2 次失败", subtitle(a));
    }

    /** 筛出一个日志里没有的应用：空状态要说「这个应用没有记录」，不是「还没有操作记录」。 */
    @Test
    public void unknownAppHasItsOwnEmptyState() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByApp("com.example.nothing");
        ShadowLooper.idleMainLooper();

        assertEquals("只看 com.example.nothing · 0 步", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains(a.getString(R.string.journal_empty_app)));
        assertFalse(body.contains(a.getString(R.string.journal_empty_hint)));
    }

    /** 装了应用就显示应用名；没装（或查不到）退回包名，绝不显示空白。 */
    @Test
    public void labelFallsBackToPackageName() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        String own = a.appLabel(a.getPackageName());
        CharSequence expected = ctx.getApplicationInfo().loadLabel(ctx.getPackageManager());
        assertEquals(expected.toString(), own);

        assertEquals("com.example.nothing", a.appLabel("com.example.nothing"));
        assertEquals("", a.appLabel(null));
    }
}
