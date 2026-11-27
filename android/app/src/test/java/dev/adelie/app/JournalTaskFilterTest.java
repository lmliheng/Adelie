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

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowDialog;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;

import dev.adelie.app.control.PhoneControl;

/**
 * 回放页「点段头只看这一轮」：日志攒了十几轮以后，想复盘刚才那一轮，
 * 不用先去点「最近一轮」再数段头 —— 点那段的小标题就只剩它，再点一下放开。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalTaskFilterTest {

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String MM = "com.tencent.mm";
    private static final String FILES = "com.oneplus.filemanager";

    /** 第一轮 4 步 1 次失败；隔一分半第二轮 3 步 1 次失败。 */
    private static final long FIRST_TASK = 1_700_000_000_000L;
    private static final long SECOND_TASK = FIRST_TASK + 3 * 25_000L + 90_000L;

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
        long t = FIRST_TASK;
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
                o.put("task", i < 4 ? FIRST_TASK : SECOND_TASK);
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

    private MainActivity openJournal() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seed(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();
        return a;
    }

    private String subtitle(MainActivity a) {
        return ((TextView) a.findViewById(R.id.journal_subtitle)).getText().toString();
    }

    private String clock(long t) {
        return new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
                .format(new java.util.Date(t));
    }

    /** body 的第 n 个孩子（0 是最上面那一轮的段头）。 */
    private View bodyChild(MainActivity a, int index) {
        ViewGroup body = a.findViewById(R.id.journal_body);
        return body.getChildAt(index);
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

    /** 第二轮第一行的时间：段头上写的是它，不是 task 的 id。 */
    private long secondStart() {
        return FIRST_TASK + 4 * 25_000L;
    }

    /** 找到写着某一轮时间的段头（body 里除了段头还有每一步的行，不能靠位置）。 */
    private View roundHeader(MainActivity a, long first) {
        ViewGroup body = a.findViewById(R.id.journal_body);
        String want = "任务 " + clock(first);
        for (int i = 0; i < body.getChildCount(); i++) {
            View child = body.getChildAt(i);
            if (String.join(" / ", texts(child)).contains(want)) return child;
        }
        throw new AssertionError("没找到写着 " + want + " 的段头");
    }

    /** 段头最上面那一轮的点按（最新一轮 = 文件管理那 3 步）。 */
    private void tapNewestHeader(MainActivity a) {
        bodyChild(a, 0).performClick();
        ShadowLooper.idleMainLooper();
    }

    @Test
    public void headersAdvertiseThemselvesBeforeAnythingIsPicked() throws Exception {
        MainActivity a = openJournal();
        String head0 = String.join(" / ", texts(bodyChild(a, 0)));
        assertTrue(head0, head0.contains(a.getString(R.string.journal_only_this_task)));
        // 页面刚打开时是全部：标题写着总数，两轮都在
        assertEquals("7 条 · 2 次失败", subtitle(a));
        assertTrue(bodyText(a).contains("点「发送」"));
        assertTrue(bodyText(a).contains("分享到微信"));
    }

    @Test
    public void tappingAHeaderKeepsOnlyThatRound() throws Exception {
        MainActivity a = openJournal();
        tapNewestHeader(a);

        // 副标题写明只看哪一轮、这一轮几步几次失败
        assertEquals("只看 " + clock(secondStart()) + " 那轮 · 3 步 · 1 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("分享到微信"));
        assertFalse("上一轮的步骤不该出现", body.contains("点「发送」"));
        // 只剩这一轮，段头右边改成「放开」的说法
        String head0 = String.join(" / ", texts(bodyChild(a, 0)));
        assertTrue(head0, head0.contains(a.getString(R.string.journal_task_all)));
    }

    @Test
    public void tappingTheHeaderAgainLetsEveryRoundBackIn() throws Exception {
        MainActivity a = openJournal();
        tapNewestHeader(a);
        tapNewestHeader(a);

        assertEquals("7 条 · 2 次失败", subtitle(a));
        String body = bodyText(a);
        assertTrue(body.contains("点「发送」"));
        assertTrue(body.contains("分享到微信"));
    }

    @Test
    public void theOlderRoundCanBePickedToo() throws Exception {
        MainActivity a = openJournal();
        roundHeader(a, FIRST_TASK).performClick();
        ShadowLooper.idleMainLooper();

        assertEquals("只看 " + clock(FIRST_TASK) + " 那轮 · 4 步 · 1 次失败", subtitle(a));
        String bodyText = bodyText(a);
        assertTrue(bodyText.contains("点「发送」"));
        assertFalse(bodyText.contains("分享到微信"));
    }

    /** 「全部」那颗 chip 是总闸：按着某一轮的时候点它，连轮次一起放开。 */
    @Test
    public void allChipClearsTheRoundAsWell() throws Exception {
        MainActivity a = openJournal();
        tapNewestHeader(a);
        com.google.android.material.chip.Chip all = a.findViewById(R.id.journal_chip_all);
        assertFalse("筛着某一轮的时候「全部」不该是选中态", all.isChecked());
        all.performClick();
        ShadowLooper.idleMainLooper();

        assertEquals("7 条 · 2 次失败", subtitle(a));
        assertTrue(all.isChecked());
        assertTrue(bodyText(a).contains("点「发送」"));
    }

    /** 「最近一轮」和点段头是同一维度的两种说法：按了「最近一轮」，具体那一轮就得放开。 */
    @Test
    public void latestChipTakesOverFromAPickedRound() throws Exception {
        MainActivity a = openJournal();
        // 先筛上一轮，再点「最近一轮」——不能叠成空集
        roundHeader(a, FIRST_TASK).performClick();
        ShadowLooper.idleMainLooper();
        assertEquals("只看 " + clock(FIRST_TASK) + " 那轮 · 4 步 · 1 次失败", subtitle(a));

        a.findViewById(R.id.journal_chip_latest).performClick();
        ShadowLooper.idleMainLooper();

        String bodyText = bodyText(a);
        assertTrue("最近一轮 = 文件管理那 3 步", bodyText.contains("分享到微信"));
        assertFalse(bodyText.contains("点「发送」"));
        assertTrue(((com.google.android.material.chip.Chip)
                a.findViewById(R.id.journal_chip_latest)).isChecked());
    }

    /** 反过来也一样：按着「最近一轮」时点段头，最近一轮放开。 */
    @Test
    public void pickingARoundTakesOverFromTheLatestChip() throws Exception {
        MainActivity a = openJournal();
        a.findViewById(R.id.journal_chip_latest).performClick();
        ShadowLooper.idleMainLooper();
        tapNewestHeader(a);

        assertEquals("只看 " + clock(secondStart()) + " 那轮 · 3 步 · 1 次失败", subtitle(a));
        assertFalse(((com.google.android.material.chip.Chip)
                a.findViewById(R.id.journal_chip_latest)).isChecked());
    }

    /** 和「只看失败」叠着用：这一轮里翻车的那一步。 */
    @Test
    public void combinesWithTheFailedFilter() throws Exception {
        MainActivity a = openJournal();
        tapNewestHeader(a);
        a.findViewById(R.id.journal_chip_failed).performClick();
        ShadowLooper.idleMainLooper();

        String body = bodyText(a);
        assertTrue(body.contains("分享到微信"));
        assertFalse(body.contains("打开「文件管理」"));
        assertFalse(body.contains("截图"));
        // 步数口径还是这一轮的全部步数，只有列表少了几行
        assertEquals("只看 " + clock(secondStart()) + " 那轮 · 3 步 · 1 次失败", subtitle(a));
    }

    /** 和「只看某个应用」叠着用：这一轮里在微信干的活。 */
    @Test
    public void combinesWithTheAppFilter() throws Exception {
        MainActivity a = openJournal();
        roundHeader(a, FIRST_TASK).performClick();
        ShadowLooper.idleMainLooper();
        a.journalFilterByApp(FILES);
        ShadowLooper.idleMainLooper();

        // 上一轮里全是微信的步骤，和「只看文件管理」叠起来就是空的
        assertEquals("只看 " + clock(FIRST_TASK) + " 那轮 · " + a.appLabel(FILES) + " · 0 步",
                subtitle(a));
        // 叠到一条不剩时按应用那条文案说（应用筛选比轮次更具体），但页面必须给空态
        assertTrue(bodyText(a).contains(a.getString(R.string.journal_empty_app)));
    }

    /** 关掉回放页就清掉：下次进来先看到全部。 */
    @Test
    public void closingThePageResetsTheRound() throws Exception {
        MainActivity a = openJournal();
        tapNewestHeader(a);
        a.showJournal(false);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        assertEquals("7 条 · 2 次失败", subtitle(a));
        assertTrue(((com.google.android.material.chip.Chip)
                a.findViewById(R.id.journal_chip_all)).isChecked());
    }

    /** 段头变成按钮以后，点具体的某一行还是要打开那条原始记录。 */
    @Test
    public void tappingAStepStillOpensTheDetail() throws Exception {
        MainActivity a = openJournal();
        tapNewestHeader(a);
        bodyChild(a, 1).performClick();
        ShadowLooper.idleMainLooper();

        android.app.Dialog latest = ShadowDialog.getLatestDialog();
        assertNotNull(latest);
        assertTrue(latest.isShowing());
    }
}
