package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
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

import dev.adelie.app.control.PhoneControl;

/**
 * 诊断包：手机上出问题时，人点一下就能把「版本、设备、准备状态、最近的日志」发出来。
 *
 * <p>这块最容易坏的方式是「诊断工具自己崩了」或者「导出的是空文件」—— 出问题的时候它正好不可用，
 * 比没有还糟。所以每段读不到都必须降级成一行说明，且导出的文件里真的要有内容。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class DiagnosticsTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private Context ctx;

    @Before
    public void setUp() throws Exception {
        ctx = ApplicationProvider.getApplicationContext();
        Settings.Secure.putString(ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, null);
        PhoneControl.clearJournal(ctx);
        // FileProvider 把 authority → 路径的映射缓在静态字段里，每个用例的临时目录不同
        java.lang.reflect.Field cache =
                androidx.core.content.FileProvider.class.getDeclaredField("sCache");
        cache.setAccessible(true);
        Object map = cache.get(null);
        if (map instanceof java.util.Map) ((java.util.Map<?, ?>) map).clear();
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

    private void seedJournal(String step) throws Exception {
        File dir = new File(ctx.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File file = new File(dir, "phone-journal.jsonl");
        JSONObject o = new JSONObject();
        o.put("t", 1_700_000_000_000L);
        o.put("action", "tap");
        o.put("step", step);
        o.put("ok", false);
        o.put("foreground", "com.tencent.mm");
        o.put("error", "not_found");
        try (OutputStream out = new FileOutputStream(file, false)) {
            out.write((o.toString() + "\n").getBytes(UTF8));
        }
    }

    private boolean findText(View root, String text) {
        if (root instanceof TextView) {
            CharSequence value = ((TextView) root).getText();
            if (value != null && value.toString().contains(text)) return true;
        }
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (findText(group.getChildAt(i), text)) return true;
            }
        }
        return false;
    }

    @Test
    public void reportCarriesEverySection() throws Exception {
        String text = Diagnostics.text(ctx);
        assertTrue(text, text.startsWith("Adelie 诊断包"));
        assertTrue(text, text.contains("== 应用 =="));
        assertTrue(text, text.contains("包名：" + ctx.getPackageName()));
        assertTrue(text, text.contains("== 准备检查 =="));
        assertTrue(text, text.contains("无障碍服务"));
        assertTrue(text, text.contains("== 手机操控 =="));
        assertTrue(text, text.contains("无障碍：未开启"));
        assertTrue(text, text.contains("最近运行日志"));
        assertTrue(text, text.contains("最近任务日志"));
    }

    /** 上次崩过的话，现场要原样带进诊断包 —— 这正是开发者在等的那一段。 */
    @Test
    public void reportCarriesTheLastCrash() throws Exception {
        CrashLog.clear(ctx);
        assertTrue("没崩过也写一句，别让人以为漏了",
                Diagnostics.text(ctx).contains("== 上次异常退出 =="));

        CrashLog.write(ctx, Thread.currentThread(), new IllegalStateException("诊断包里的那次"));
        String text = Diagnostics.text(ctx);
        assertTrue(text, text.contains("== 上次异常退出 =="));
        assertTrue(text, text.contains("java.lang.IllegalStateException: 诊断包里的那次"));
        CrashLog.clear(ctx);
    }

    @Test
    public void reportShowsTheInstalledVersion() throws Exception {
        String version = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        assertTrue(Diagnostics.text(ctx).contains("版本：" + version));
    }

    /** 任务日志的最近几步要带出来 —— 这正是要排查的东西。 */
    @Test
    public void reportIncludesRecentJournalSteps() throws Exception {
        seedJournal("点「发送」");
        String text = Diagnostics.text(ctx);
        assertTrue(text, text.contains("点「发送」"));
        assertTrue(text, text.contains("not_found"));
    }

    @Test
    public void ansiColoursAreStripped() {
        assertEquals("监听：http://127.0.0.1:48231",
                Diagnostics.stripAnsi("\u001B[32m监听：http://127.0.0.1:48231\u001B[0m"));
        assertEquals("", Diagnostics.stripAnsi(null));
        assertEquals("没有颜色", Diagnostics.stripAnsi("没有颜色"));
    }

    @Test
    public void fileNameIsTimestamped() {
        String name = Diagnostics.fileName(1_700_000_000_000L);
        assertTrue(name, name.startsWith("adelie-diagnostics-"));
        assertTrue(name, name.endsWith(".txt"));
    }

    /** 真点一下：文件落在 cache/share，分享面板起来，文件里真的有内容。 */
    @Test
    public void exportWritesFileAndOpensShareSheet() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        seedJournal("点「搜索」");

        a.exportDiagnostics();
        ShadowLooper.idleMainLooper();

        File dir = new File(a.getCacheDir(), JournalExport.DIR);
        File[] files = dir.listFiles();
        assertNotNull(files);
        assertEquals(1, files.length);
        assertTrue(files[0].getName(), files[0].getName().endsWith(".txt"));

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
        String body = new String(all, UTF8);
        assertTrue(body.length() > 200);
        assertTrue(body, body.contains("点「搜索」"));
        assertTrue(body, body.contains("== 应用 =="));

        Intent started = shadowOf(a).getNextStartedActivity();
        assertNotNull(started);
        assertEquals(Intent.ACTION_CHOOSER, started.getAction());
        Intent send = started.getParcelableExtra(Intent.EXTRA_INTENT);
        assertNotNull(send);
        assertEquals(Intent.ACTION_SEND, send.getAction());
        assertEquals("text/plain", send.getType());
        Uri stream = send.getParcelableExtra(Intent.EXTRA_STREAM);
        assertNotNull(stream);
        assertEquals("content", stream.getScheme());
        assertEquals("dev.adelie.app.files", stream.getAuthority());
    }

    /** 开发者模式下的设置页要摆出这一行，用户才找得到。 */
    @Test
    public void settingsPageHasTheRow() throws Exception {
        // 开发者开关是 onCreate 里读进字段的，要在起界面之前写
        ctx.getSharedPreferences("adelie", 0).edit().putBoolean("developer", true).commit();
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        com.google.android.material.bottomnavigation.BottomNavigationView nav =
                a.findViewById(R.id.nav);
        nav.setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();

        assertTrue(findText(a.findViewById(R.id.settings_body),
                a.getString(R.string.row_diagnostics)));
    }
}
