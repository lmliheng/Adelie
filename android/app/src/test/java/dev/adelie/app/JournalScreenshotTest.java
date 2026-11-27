package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

/**
 * 任务日志回放页：没有真机也把这一页画出来看。
 *
 *   /opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.JournalScreenshotTest
 *
 * 图在 app/build/ui-shots/ 下（:app:clean 会删掉，构建完重跑一次）。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class JournalScreenshotTest {

    private static final int W = 1080;
    private static final int H = 2340;
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private ActivityController<MainActivity> launch() {
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        // 真机上这两个应用都在，日志行里写的是「微信」「文件管理」而不是包名
        install(a, "com.tencent.mm", "微信");
        install(a, "com.oneplus.filemanager", "文件管理");
        ShadowLooper.idleMainLooper();
        return c;
    }

    /**
     * 摆一份像真跑过两轮任务的日志：第一轮 4 步里有 1 步失败，隔了一会儿又跑了第二轮 3 步，
     * 也栽了一步。回放页把它们分成两段，各自的标题里写着步数与失败数。
     */
    private void seed(MainActivity a) throws Exception {
        dev.adelie.app.control.PhoneControl.clearJournal(a);
        File dir = new File(a.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        // 第一列动作名，第二列人话步骤，第三列结果，第四列错误码
        String[][] rows = {
                {"读屏", "读屏", "ok", ""},
                {"点按", "点「搜索」", "ok", ""},
                {"输入文字", "输入「明天下午三点」", "ok", ""},
                {"点按", "点「发送」", "fail", "not_found"},
                {"打开应用", "打开「微信」", "ok", ""},
                {"点按", "点「发送」", "fail", "confirm_timeout"},
                {"截图", "截图", "ok", ""},
        };
        long t = System.currentTimeMillis() - rows.length * 25000L;
        long firstTask = t;
        long secondTask = t + 4 * 25000L + 90000L;   // 两轮任务之间隔一分半
        try (OutputStream out = new FileOutputStream(file, false)) {
            for (int i = 0; i < rows.length; i++) {
                String[] row = rows[i];
                JSONObject o = new JSONObject();
                o.put("t", t);
                o.put("action", row[0]);
                o.put("ok", "ok".equals(row[2]));
                o.put("step", row[1]);
                o.put("foreground", "com.tencent.mm");
                o.put("task", i < 4 ? firstTask : secondTask);
                if (!row[3].isEmpty()) o.put("error", row[3]);
                out.write((o.toString() + "\n").getBytes(UTF8));
                t += 25000L;
            }
        }
    }

    private void shot(MainActivity activity, String name) throws Exception {
        shot(activity, name, H);
    }

    private void shot(MainActivity activity, String name, int height) throws Exception {
        View decor = activity.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(W, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, W, height);
        Bitmap bmp = Bitmap.createBitmap(W, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        decor.draw(canvas);
        File dir = new File("build/ui-shots");
        assertNotNull(dir);
        dir.mkdirs();
        try (OutputStream os = new FileOutputStream(new File(dir, name + ".png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
    }

    @Test
    public void journalShowsEveryStepNewestFirst() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        // 本轮（3 步）：标题 + 3 行 + 2 条分隔线；组间 1 条；上一轮（4 步）：标题 + 4 行 + 3 条分隔线
        assertEquals(15, body.getChildCount());
        TextView subtitle = a.findViewById(R.id.journal_subtitle);
        assertEquals("7 条 · 2 次失败", subtitle.getText().toString());

        // 第一块是本轮的小标题，写着几步、失了几步
        String headText = headText(body.getChildAt(0));
        assertTrue(headText, headText.startsWith("任务 "));
        assertTrue(headText, headText.endsWith(" · 3 步 · 1 次失败"));

        // 下面一行是本轮最后记下的「截图」（行结构：圆点 + 文字列 + 时间）
        android.view.ViewGroup firstRow = (android.view.ViewGroup) body.getChildAt(1);
        android.view.ViewGroup column = (android.view.ViewGroup) firstRow.getChildAt(1);
        assertEquals("截图", ((TextView) column.getChildAt(0)).getText().toString());
        shot(a, "10-journal");
    }

    @Test
    public void journalOnlyFailed() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.findViewById(R.id.journal_chip_failed).performClick();
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        // 两段各 1 条失败：标题 + 行，中间一条分隔线
        assertEquals(5, body.getChildCount());
        String headText = headText(body.getChildAt(0));
        assertTrue(headText, headText.endsWith(" · 3 步 · 1 次失败"));
        shot(a, "11-journal-failed");
    }

    /** 日志攒到很多条以后，只想看刚才那一轮：点「最近一轮」，只剩最新一段。 */
    @Test
    public void latestChipShowsOnlyTheLastRun() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.findViewById(R.id.journal_chip_latest).performClick();
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        // 只有本轮：标题 + 3 行 + 2 条分隔线
        assertEquals(6, body.getChildCount());
        String headText = headText(body.getChildAt(0));
        assertTrue(headText, headText.endsWith(" · 3 步 · 1 次失败"));
        // 总数还是全部那些，筛选只影响列表
        assertEquals("7 条 · 2 次失败",
                ((TextView) a.findViewById(R.id.journal_subtitle)).getText().toString());
        shot(a, "14-journal-latest");
    }

    /** 「最近一轮」和「只看失败」叠起来就是「刚才那一轮里翻车的几步」。 */
    @Test
    public void latestAndFailedCombine() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.findViewById(R.id.journal_chip_latest).performClick();
        a.findViewById(R.id.journal_chip_failed).performClick();
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        // 本轮 1 条失败：标题 + 1 行
        assertEquals(2, body.getChildCount());
        String headText = headText(body.getChildAt(0));
        assertTrue(headText, headText.endsWith(" · 3 步 · 1 次失败"));
    }

    /** 点一下段头只剩这一轮：副标题写着哪一轮，段头右边那句改成「全部轮次」。 */
    @Test
    public void tappingTheSegmentHeaderKeepsOnlyThatRound() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        assertEquals(15, body.getChildCount());
        // 最上面那段是本轮（3 步）：标题 + 3 行 + 2 条分隔线
        body.getChildAt(0).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(6, body.getChildCount());
        String head = headText(body.getChildAt(0));
        assertTrue(head, head.endsWith(" · 3 步 · 1 次失败"));
        String sub = ((TextView) a.findViewById(R.id.journal_subtitle)).getText().toString();
        assertTrue(sub, sub.startsWith("只看 ") && sub.endsWith(" 那轮 · 3 步 · 1 次失败"));
        shot(a, "27-journal-task");
    }

    @Test
    public void latestChipTogglesBackToAll() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.findViewById(R.id.journal_chip_latest).performClick();
        a.findViewById(R.id.journal_chip_latest).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals(15, ((LinearLayout) a.findViewById(R.id.journal_body)).getChildCount());
    }

    /** 收起回放页时把筛选清掉，下次进来先看全部。 */
    @Test
    public void closingThePageResetsFilters() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.findViewById(R.id.journal_chip_latest).performClick();
        ShadowLooper.idleMainLooper();
        assertEquals(6, ((LinearLayout) a.findViewById(R.id.journal_body)).getChildCount());

        a.showJournal(false);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();
        assertEquals(15, ((LinearLayout) a.findViewById(R.id.journal_body)).getChildCount());
    }

    @Test
    public void journalEmptyState() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        dev.adelie.app.control.PhoneControl.clearJournal(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        assertEquals(1, body.getChildCount());
        TextView subtitle = a.findViewById(R.id.journal_subtitle);
        assertEquals("0 条", subtitle.getText().toString());
        shot(a, "12-journal-empty");
    }

    /** 导出：文件落进 cache/share，内容是全量 7 条，并把分享面板叫起来。 */
    @Test
    public void journalExportWritesFileAndOpensShareSheet() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        a.findViewById(R.id.journal_export).performClick();
        ShadowLooper.idleMainLooper();

        File dir = new File(a.getCacheDir(), JournalExport.DIR);
        File[] files = dir.listFiles();
        assertNotNull(files);
        assertEquals(1, files.length);
        assertTrue(files[0].getName(), files[0].getName().endsWith(".jsonl"));

        byte[] all = new byte[(int) files[0].length()];
        java.io.FileInputStream in = new java.io.FileInputStream(files[0]);
        try {
            int off = 0;
            while (off < all.length) {
                int n = in.read(all, off, all.length - off);
                if (n < 0) break;
                off += n;
            }
        } finally {
            in.close();
        }
        assertEquals(7, new String(all, UTF8).split("\n").length);

        Intent started = shadowOf(a).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(Intent.ACTION_CHOOSER, started.getAction());
        Intent send = started.getParcelableExtra(Intent.EXTRA_INTENT);
        assertNotNull(send);
        assertEquals(Intent.ACTION_SEND, send.getAction());
        assertEquals("application/json", send.getType());
    }

    /** 设置页那一行要能一眼看出「有几条、有没有失败」；这张图是整页拉长拍的。 */
    @Test
    public void settingsRowSummarizesJournal() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        ((com.google.android.material.bottomnavigation.BottomNavigationView) a.findViewById(R.id.nav))
                .setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        assertTrue(findText(a.findViewById(R.id.settings_body), "7 条 · 2 次失败"));
        shot(a, "13-settings-journal", 5600);
    }

    /**
     * 组头是「小红点 + 文字 + 右边那句『只看这一轮』」的一行，取文字那一颗（第一颗 TextView，
     * 也就是「任务 14:32:05 · 7 步 · 1 次失败」），别把右边的按钮说明也算进来。
     */
    private String headText(View head) {
        if (head instanceof TextView) return ((TextView) head).getText().toString();
        if (head instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) head;
            for (int i = 0; i < group.getChildCount(); i++) {
                View child = group.getChildAt(i);
                if (child instanceof TextView) return ((TextView) child).getText().toString();
            }
        }
        return "";
    }

    private boolean findText(View root, String text) {
        if (root instanceof TextView) {
            CharSequence value = ((TextView) root).getText();
            if (value != null && value.toString().equals(text)) return true;
        }
        if (root instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (findText(group.getChildAt(i), text)) return true;
            }
        }
        return false;
    }

    @Test
    public void journalBackReturnsToSettings() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();
        assertEquals(View.VISIBLE, a.findViewById(R.id.journal_page).getVisibility());

        a.onBackPressed();
        ShadowLooper.idleMainLooper();
        assertEquals(View.GONE, a.findViewById(R.id.journal_page).getVisibility());
        assertEquals(View.VISIBLE, a.findViewById(R.id.settings_page).getVisibility());
    }

    /** 真机上装了微信和文件管理器：筛选 chip 上写的是应用名，不是包名。 */
    @Test
    public void journalFilteredByApp() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seedTwoApps(a);
        a.showJournal(true);
        a.journalFilterByApp("com.oneplus.filemanager");
        ShadowLooper.idleMainLooper();

        TextView chip = a.findViewById(R.id.journal_chip_app);
        assertEquals("只看 文件管理", chip.getText().toString());
        TextView subtitle = a.findViewById(R.id.journal_subtitle);
        assertEquals("只看 文件管理 · 2 步 · 1 次失败", subtitle.getText().toString());
        shot(a, "15-journal-app");
    }

    /** 「只看某个动作」：点一下「点按」，列表只剩点按那几步，副标题写着筛选。 */
    @Test
    public void journalFilteredByAction() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        // 这份种子日志的 action 写的是人话（点按），真机上是 tap 这类原值
        a.journalFilterByAction("点按");
        ShadowLooper.idleMainLooper();

        TextView subtitle = a.findViewById(R.id.journal_subtitle);
        assertEquals("只看 点按 · 3 步 · 2 次失败", subtitle.getText().toString());
        shot(a, "17-journal-action");
    }

    /** 搜一个词：日志里只剩命中的步骤，副标题写着搜的是什么。 */
    @Test
    public void journalSearchedByWord() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        com.google.android.material.textfield.TextInputEditText box = a.findViewById(R.id.journal_search);
        box.setText("发送");
        ShadowLooper.idleMainLooper();

        TextView subtitle = a.findViewById(R.id.journal_subtitle);
        assertEquals("搜「发送」 · 2 步 · 2 次失败", subtitle.getText().toString());
        shot(a, "18-journal-search");
    }

    /** 在 Robolectric 的包管理器里挂一个带名字的包，测「应用名而不是包名」那条路。 */
    private void install(MainActivity a, String pkg, String label) {
        android.content.pm.PackageInfo pi = new android.content.pm.PackageInfo();
        pi.packageName = pkg;
        pi.applicationInfo = new android.content.pm.ApplicationInfo();
        pi.applicationInfo.packageName = pkg;
        pi.applicationInfo.nonLocalizedLabel = label;
        shadowOf(a.getPackageManager()).addPackage(pi);
    }

    /** 两个应用交替的日志：微信里发消息失败，文件管理器里分享失败。 */
    private void seedTwoApps(MainActivity a) throws Exception {
        dev.adelie.app.control.PhoneControl.clearJournal(a);
        File dir = new File(a.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        String[][] rows = {
                {"com.tencent.mm", "打开应用", "打开「微信」", "ok", ""},
                {"com.tencent.mm", "点按", "点「发送」", "fail", "not_found"},
                {"com.oneplus.filemanager", "打开应用", "打开「文件管理」", "ok", ""},
                {"com.oneplus.filemanager", "分享", "分享到微信", "fail", "denied"},
        };
        long t = System.currentTimeMillis() - rows.length * 25000L;
        long task = t;
        try (OutputStream out = new FileOutputStream(file, false)) {
            for (String[] row : rows) {
                JSONObject o = new JSONObject();
                o.put("t", t);
                o.put("action", row[1]);
                o.put("step", row[2]);
                o.put("ok", "ok".equals(row[3]));
                o.put("foreground", row[0]);
                o.put("task", task);
                if (!row[4].isEmpty()) o.put("error", row[4]);
                out.write((o.toString() + "\n").getBytes(UTF8));
                t += 25000L;
            }
        }
    }
}
