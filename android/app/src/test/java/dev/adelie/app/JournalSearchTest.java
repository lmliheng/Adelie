package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import com.google.android.material.textfield.TextInputEditText;

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
 * 回放页的搜索：日志攒到几十步以后，人记得的往往只是一个词 ——「发送」「not_found」
 * 或者「文件管理」。搜一个词就只剩命中的步骤，而且和「只看失败 / 最近一轮 / 应用 / 动作」
 * 这几维叠着用；收起页面时搜索框自己清空。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalSearchTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String MM = "com.tencent.mm";
    private static final String FILES = "com.oneplus.filemanager";

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        PhoneControl.clearJournal(ctx);
    }

    /** 两轮：早的一轮 1 步（旧消息），最近一轮 7 步，跨两个应用、1 步失败。 */
    private void seed(MainActivity a) throws Exception {
        File dir = new File(a.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        long t = 1_700_000_000_000L;
        long first = t;
        long second = t + 10 * 25_000L;
        String[][] rows = {
                {MM, "tap", "点「旧消息」", "ok", ""},
                {MM, "screen", "读屏", "ok", ""},
                {MM, "tap", "点「搜索」", "ok", ""},
                {MM, "text", "输入「明天下午三点」", "ok", ""},
                {FILES, "tap", "点「发送」", "fail", "not_found"},
                {FILES, "open", "打开「文件管理」", "ok", ""},
                {FILES, "screenshot", "截图", "ok", ""},
                {FILES, "tap", "点「分享」", "ok", ""},
        };
        try (OutputStream out = new FileOutputStream(file, false)) {
            for (int i = 0; i < rows.length; i++) {
                JSONObject o = new JSONObject();
                o.put("t", t);
                o.put("action", rows[i][1]);
                o.put("step", rows[i][2]);
                o.put("ok", "ok".equals(rows[i][3]));
                o.put("foreground", rows[i][0]);
                o.put("task", i == 0 ? first : second);
                if (!rows[i][4].isEmpty()) o.put("error", rows[i][4]);
                out.write((o.toString() + "\n").getBytes(UTF8));
                t += 25_000L;
            }
        }
        install(a, MM, "微信");
        install(a, FILES, "文件管理");
    }

    private void install(MainActivity a, String pkg, String label) {
        android.content.pm.PackageInfo pi = new android.content.pm.PackageInfo();
        pi.packageName = pkg;
        pi.applicationInfo = new android.content.pm.ApplicationInfo();
        pi.applicationInfo.packageName = pkg;
        pi.applicationInfo.nonLocalizedLabel = label;
        shadowOf(a.getPackageManager()).addPackage(pi);
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

    private String bodyText(MainActivity a) {
        List<String> out = new ArrayList<>();
        collect(a.findViewById(R.id.journal_body), out);
        return String.join("\n", out);
    }

    private void collect(View root, List<String> out) {
        if (root instanceof TextView) {
            CharSequence v = ((TextView) root).getText();
            if (v != null) out.add(v.toString());
        }
        if (root instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) root;
            for (int i = 0; i < g.getChildCount(); i++) collect(g.getChildAt(i), out);
        }
    }

    private void search(MainActivity a, String text) {
        TextInputEditText box = a.findViewById(R.id.journal_search);
        box.setText(text);
        ShadowLooper.idleMainLooper();
    }

    @Test
    public void typingAWordKeepsOnlyMatchingSteps() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "发送");

        assertEquals("搜「发送」 · 1 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertFalse(body.contains("点「搜索」"));
        assertFalse(body.contains("截图"));
    }

    /** 错误码也是人记得住的东西：搜 not_found 直接找到翻车那一步（不分大小写）。 */
    @Test
    public void errorCodesAndCaseAreMatched() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "NOT_FOUND");

        assertEquals("搜「NOT_FOUND」 · 1 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertFalse(body.contains("点「分享」"));
    }

    /** 应用名（人话）也参与匹配：搜「文件管理」就是那个应用里的几步。 */
    @Test
    public void appLabelsAreMatched() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "文件管理");

        assertEquals("搜「文件管理」 · 4 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertTrue(body.contains("点「分享」"));
        assertFalse(body.contains("点「旧消息」"));
    }

    /** 动作名（点按 / 截图）也能搜，和点 chip 是同一套语汇。 */
    @Test
    public void actionLabelsAreMatched() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "截图");
        assertEquals("搜「截图」 · 1 步", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("截图"));
        assertFalse(body.contains("点「发送」"));
    }

    /** 搜索和动作筛选叠着用：先只看点按，再在点按里搜「分享」。 */
    @Test
    public void searchStacksWithActionFilter() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByAction("点按");
        ShadowLooper.idleMainLooper();
        assertEquals("只看 点按 · 4 步 · 1 次失败", subtitle(a));

        search(a, "分享");

        assertEquals("只看 点按 · 搜「分享」 · 1 步", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「分享」"));
        assertFalse(body.contains("点「发送」"));
    }

    /** 换筛选 / 搜索词之后列表回到顶部：否则停在上一次的滚动位置，看到的是空白。 */
    @Test
    public void changingTheSearchScrollsBackToTheTop() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        android.widget.ScrollView scroll = a.findViewById(R.id.journal_scroll);
        scroll.scrollTo(0, 600);
        assertEquals(600, scroll.getScrollY());

        search(a, "文件管理");
        assertEquals(0, scroll.getScrollY());

        // 点 chip 换筛选也一样
        scroll.scrollTo(0, 400);
        a.journalFilterByAction("点按");
        assertEquals(0, scroll.getScrollY());
    }

    @Test
    public void noMatchShowsTheEmptyState() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "zzz不存在");

        assertEquals("搜「zzz不存在」 · 0 步", subtitle(a));
        assertTrue(bodyText(a).contains("没有匹配的步骤"));
    }

    /** 收起页面时搜索框自己清空：下次进来先看全部，不会被上次那个词困住。 */
    @Test
    public void closingThePageClearsTheSearch() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        search(a, "发送");
        assertEquals("搜「发送」 · 1 步 · 1 次失败", subtitle(a));

        a.showJournal(false);
        TextInputEditText box = a.findViewById(R.id.journal_search);
        assertEquals("", String.valueOf(box.getText()));

        a.showJournal(true);
        ShadowLooper.idleMainLooper();
        assertEquals("8 条 · 1 次失败", subtitle(a));
        assertNotNull(box);
    }

    /** 多个词是「都要」，不是「有一个」：搜「发送 文件管理」= 文件管理器里点发送那一步。 */
    @Test
    public void everyWordMustMatch() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "发送 文件管理");

        assertEquals("搜「发送 文件管理」 · 1 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertFalse(body.contains("点「分享」"));
    }

    /** 词可以落在不同字段上（步骤里一个、应用名里一个），但每个都得有着落。 */
    @Test
    public void oneWordWithoutMatchEmptiesTheList() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "发送 zzz不存在");
        assertEquals("搜「发送 zzz不存在」 · 0 步", subtitle(a));
        assertTrue(bodyText(a).contains("没有匹配的步骤"));
    }

    /** 命中的字要标出来（强调色 + 加粗），没命中的行不留 span。 */
    @Test
    public void matchedWordsAreHighlighted() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "发送");

        TextView hit = textView(a, "点「发送」");
        assertNotNull(hit);
        assertTrue(hit.getText() instanceof android.text.Spanned);
        android.text.Spanned span = (android.text.Spanned) hit.getText();
        assertTrue(span.getSpans(0, span.length(), Object.class).length > 0);

        // 应用名那一段也标（搜应用名时同样一眼看到）
        search(a, "文件管理");
        TextView meta = textView(a, "点按 · 文件管理");
        assertNotNull(meta);
        assertTrue(((android.text.Spanned) meta.getText())
                .getSpans(0, meta.getText().length(), Object.class).length > 0);
    }

    /** 没搜的时候不该有任何高亮（正常回放不受影响）。 */
    @Test
    public void noHighlightWithoutQuery() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        TextView title = textView(a, "点「发送」");
        assertNotNull(title);
        assertFalse(title.getText() instanceof android.text.Spanned
                && ((android.text.Spanned) title.getText())
                .getSpans(0, title.getText().length(), Object.class).length > 0);
    }

    private TextView textView(MainActivity a, String text) {
        List<TextView> all = new ArrayList<>();
        collectTextViews(a.findViewById(R.id.journal_body), all);
        for (TextView t : all) {
            if (text.contentEquals(t.getText())) return t;
        }
        return null;
    }

    private void collectTextViews(View root, List<TextView> out) {
        if (root instanceof TextView) out.add((TextView) root);
        if (root instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) root;
            for (int i = 0; i < g.getChildCount(); i++) collectTextViews(g.getChildAt(i), out);
        }
    }

    @Test
    public void clearIconIsThereWhenThereIsText() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        com.google.android.material.textfield.TextInputLayout box = a.findViewById(R.id.journal_search_box);
        TextInputEditText edit = a.findViewById(R.id.journal_search);
        // 和 Material 的搜索框一致：有字、且正在输入时才给 ✕，点别处就收起来
        assertFalse(box.isEndIconVisible());
        edit.requestFocus();
        search(a, "发送");
        ShadowLooper.idleMainLooper();
        assertTrue(box.isEndIconVisible());
    }

    /** 只敲空格等于没搜。 */
    @Test
    public void blankQueryMeansEverything() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        search(a, "   ");

        assertEquals("8 条 · 1 次失败", subtitle(a));
    }
}
