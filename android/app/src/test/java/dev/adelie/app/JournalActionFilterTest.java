package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import com.google.android.material.chip.Chip;
import com.google.android.material.chip.ChipGroup;

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
 * 回放页的「只看某个动作」：一轮里点按、输入、截图混着来，出事的时候人只想看
 * 「刚才点了哪些」。动作类型是独立的一维：和应用筛选、「只看失败」「最近一轮」都能叠着用，
 * 只有一类动作时这一排藏起来（没什么可筛的）。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalActionFilterTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String MM = "com.tencent.mm";
    private static final String FILES = "com.oneplus.filemanager";

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        PhoneControl.clearJournal(ctx);
    }

    /**
     * 一轮 7 步：读屏 1、点按 3（其中 1 步失败）、输入 1、打开应用 1、截图 1；
     * 另有一段更早的「点按」不属于这一轮。
     */
    private void seed(MainActivity a) throws Exception {
        File dir = new File(a.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        long t = 1_700_000_000_000L;
        long first = t;
        long second = t + 10 * 25_000L;
        String[][] rows = {
                // 协议里 click 和 tap 是同一个动作，别长成两颗一样的 chip
                {MM, "click", "点「旧消息」", "ok", ""},
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
        // 应用名要显示成人话：「微信」「文件管理」
        android.content.pm.PackageInfo mm = new android.content.pm.PackageInfo();
        mm.packageName = MM;
        mm.applicationInfo = new android.content.pm.ApplicationInfo();
        mm.applicationInfo.packageName = MM;
        mm.applicationInfo.nonLocalizedLabel = "微信";
        shadowOf(a.getPackageManager()).addPackage(mm);
        android.content.pm.PackageInfo files = new android.content.pm.PackageInfo();
        files.packageName = FILES;
        files.applicationInfo = new android.content.pm.ApplicationInfo();
        files.applicationInfo.packageName = FILES;
        files.applicationInfo.nonLocalizedLabel = "文件管理";
        shadowOf(a.getPackageManager()).addPackage(files);
    }

    private static org.robolectric.shadows.ShadowPackageManager shadowOf(android.content.pm.PackageManager pm) {
        return org.robolectric.Shadows.shadowOf(pm);
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

    private List<String> chipTexts(MainActivity a) {
        ChipGroup group = a.findViewById(R.id.journal_action_row);
        List<String> out = new ArrayList<>();
        for (int i = 0; i < group.getChildCount(); i++) {
            out.add(((Chip) group.getChildAt(i)).getText().toString());
        }
        return out;
    }

    private Chip chip(MainActivity a, String label) {
        ChipGroup group = a.findViewById(R.id.journal_action_row);
        for (int i = 0; i < group.getChildCount(); i++) {
            Chip c = (Chip) group.getChildAt(i);
            if (label.contentEquals(c.getText())) return c;
        }
        return null;
    }

    @Test
    public void chipsListEveryActionInTheJournalMostFrequentFirst() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals(View.VISIBLE, a.findViewById(R.id.journal_action_scroll).getVisibility());
        // 点按 4 颗（含更早那一轮），其余各 1；次数多的排前面
        assertEquals(java.util.Arrays.asList("点按", "截图", "打开应用", "读屏", "输入文字"),
                chipTexts(a));
        // 拉开之前先看到全部
        assertEquals("8 条 · 1 次失败", subtitle(a));
        assertFalse(chip(a, "点按").isChecked());
    }

    @Test
    public void tappingAnActionKeepsOnlyThatAction() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        chip(a, "点按").performClick();
        ShadowLooper.idleMainLooper();

        assertEquals("只看 点按 · 4 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「搜索」"));
        assertTrue(body.contains("点「旧消息」"));
        assertFalse(body.contains("读屏"));
        assertFalse(body.contains("输入「明天下午三点」"));
        assertFalse(body.contains("截图"));
        assertTrue(chip(a, "点按").isChecked());
    }

    /** 同一类动作的不同写法（tap / click）归成一颗 chip，点它两类都出来。 */
    @Test
    public void aliasesShareOneChip() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals(5, ((ChipGroup) a.findViewById(R.id.journal_action_row)).getChildCount());
        chip(a, "点按").performClick();
        ShadowLooper.idleMainLooper();

        String body = bodyText(a);
        assertTrue(body.contains("点「旧消息」"));
        assertTrue(body.contains("点「搜索」"));
        assertTrue(body.contains("点「发送」"));
        assertTrue(body.contains("点「分享」"));
    }

    @Test
    public void tappingTheSameChipAgainClearsIt() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        chip(a, "点按").performClick();
        ShadowLooper.idleMainLooper();
        chip(a, "点按").performClick();
        ShadowLooper.idleMainLooper();

        assertEquals("8 条 · 1 次失败", subtitle(a));
        assertFalse(chip(a, "点按").isChecked());
    }

    /** 动作筛选是独立的一维：和应用筛选、「只看失败」叠着用就是「微信里失败的这一点按」。 */
    @Test
    public void actionStacksWithAppAndFailureFilters() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByApp(FILES);
        a.journalFilterByAction("点按");
        ShadowLooper.idleMainLooper();

        assertEquals("只看 文件管理 · 点按 · 2 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertTrue(body.contains("点「分享」"));
        assertFalse(body.contains("点「旧消息」"));
        assertFalse(body.contains("截图"));

        a.findViewById(R.id.journal_chip_failed).performClick();
        ShadowLooper.idleMainLooper();

        // 步数还是这一维里的全部步数（「几 次失败」说的是这些步里翻了几步），列表只剩失败的那条
        assertEquals("只看 文件管理 · 点按 · 2 步 · 1 次失败", subtitle(a));
        body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertFalse(body.contains("点「分享」"));

        // 清掉动作那一维，应用与「只看失败」还在
        a.journalFilterByAction(null);
        ShadowLooper.idleMainLooper();
        assertEquals("只看 文件管理 · 4 步 · 1 次失败", subtitle(a));
        assertFalse(bodyText(a).contains("截图"));
        // 再点「全部」把失败那一维也放掉，这个应用的 4 步都回来
        a.findViewById(R.id.journal_chip_all).performClick();
        ShadowLooper.idleMainLooper();
        assertTrue(bodyText(a).contains("截图"));
    }

    /** 只有一类动作时这一排没有意义，藏起来。 */
    @Test
    public void aSingleActionTypeHidesTheRow() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        PhoneControl.clearJournal(a);
        File dir = new File(a.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        try (OutputStream out = new FileOutputStream(file, false)) {
            for (int i = 0; i < 3; i++) {
                JSONObject o = new JSONObject();
                o.put("t", 1_700_000_000_000L + i * 1000L);
                o.put("action", "tap");
                o.put("ok", true);
                o.put("foreground", MM);
                o.put("task", 1_700_000_000_000L);
                out.write((o.toString() + "\n").getBytes(UTF8));
            }
        }
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals(View.GONE, a.findViewById(R.id.journal_action_scroll).getVisibility());
        assertEquals("3 条", subtitle(a));
    }

    /** 收起页面时清掉筛选：下次进来先看到全部，不会被上次的筛选困住。 */
    @Test
    public void closingThePageClearsTheActionFilter() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.journalFilterByAction("截图");
        ShadowLooper.idleMainLooper();
        assertEquals("只看 截图 · 1 步", subtitle(a));

        a.showJournal(false);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals("8 条 · 1 次失败", subtitle(a));
        assertFalse(chip(a, "截图").isChecked());
        assertNotNull(a);
    }
}
