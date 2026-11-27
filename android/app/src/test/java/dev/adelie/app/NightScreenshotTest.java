package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.util.TypedValue;
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
 * 深色模式：同一套界面在 night 配置下画一遍。
 *
 *   /opt/gradle-8.9/bin/gradle :app:testDebugUnitTest --tests dev.adelie.app.NightScreenshotTest
 *
 * 深色不是简单反色：底是纯黑（不用蓝灰），卡片靠 1px 细线分层，强调色换成亮一档的蓝，
 * 亮蓝底上的字要反过来用深色。这几条都在这里锁住，顺便把图存下来看。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-night-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class NightScreenshotTest {

    private static final int W = 1080;
    private static final int H = 2340;
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private ActivityController<MainActivity> launch() {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ShadowLooper.idleMainLooper();
        return c;
    }

    private int attr(MainActivity a, int resId) {
        TypedValue value = new TypedValue();
        assertNotNull(a.getTheme().resolveAttribute(resId, value, true));
        if (value.type >= TypedValue.TYPE_FIRST_COLOR_INT
                && value.type <= TypedValue.TYPE_LAST_COLOR_INT) {
            return value.data;
        }
        return a.getColor(value.resourceId);
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
        decor.draw(new Canvas(bmp));
        File dir = new File("build/ui-shots");
        dir.mkdirs();
        try (OutputStream os = new FileOutputStream(new File(dir, name + ".png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
        }
    }

    private void seedJournal(MainActivity a) throws Exception {
        dev.adelie.app.control.PhoneControl.clearJournal(a);
        File dir = new File(a.getFilesDir(), "adelie/data");
        dir.mkdirs();
        String[][] rows = {
                {"读屏", "读屏", "ok", "", "com.tencent.mm"},
                {"点按", "点「搜索」", "ok", "", "com.tencent.mm"},
                {"tap", "点「发送」", "fail", "not_found", "com.tencent.mm"},
                {"open", "打开「微信」", "ok", "", "com.tencent.mm"},
        };
        long t = System.currentTimeMillis() - rows.length * 30000L;
        try (OutputStream out = new FileOutputStream(new File(dir, "phone-journal.jsonl"), false)) {
            for (String[] row : rows) {
                JSONObject o = new JSONObject();
                o.put("t", t);
                o.put("action", row[0]);
                o.put("ok", "ok".equals(row[2]));
                o.put("step", row[1]);
                o.put("foreground", row[4]);
                if (!row[3].isEmpty()) o.put("error", row[3]);
                out.write((o.toString() + "\n").getBytes(UTF8));
                t += 30000L;
            }
        }
    }

    @Test
    public void paletteIsPureBlackWithLightText() {
        MainActivity a = launch().get();
        assertEquals(0xFF000000, a.getColor(R.color.surface));
        assertEquals(0xFFF3F4F6, a.getColor(R.color.ink));
        assertEquals(0xFF1F1F1F, a.getColor(R.color.divider));
        // 强调色在深色底上要亮一档，字反过来用深色
        assertEquals(0xFF8AB4F8, a.getColor(R.color.accent));
        assertEquals(0xFF0B1220, a.getColor(R.color.accent_on));

        // 主题里也得是这一套，不然 Material 组件会拿到浅色默认值
        assertEquals(0xFF000000, attr(a, com.google.android.material.R.attr.colorSurface));
        assertEquals(0xFFF3F4F6, attr(a, com.google.android.material.R.attr.colorOnSurface));
        assertEquals(0xFF8AB4F8, attr(a, com.google.android.material.R.attr.colorPrimary));
    }

    @Test
    public void statusBarIconIsLightOnDark() {
        MainActivity a = launch().get();
        int flags = a.getWindow().getDecorView().getSystemUiVisibility();
        assertFalse("深色底上不能再用深色状态栏图标",
                (flags & View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) != 0);
    }

    @Test
    public void nightSplash() throws Exception {
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        ShadowLooper.idleMainLooper();
        shot(c.get(), "20-splash-night");
    }

    @Test
    public void nightShellAndSettings() throws Exception {
        MainActivity a = launch().get();
        shot(a, "21-shell-chat-night");

        ((com.google.android.material.bottomnavigation.BottomNavigationView) a.findViewById(R.id.nav))
                .setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        shot(a, "22-settings-night", 5600);
    }

    @Test
    public void nightJournalPage() throws Exception {
        MainActivity a = launch().get();
        seedJournal(a);
        a.showJournal(true);
        ShadowLooper.idleMainLooper();

        LinearLayout body = a.findViewById(R.id.journal_body);
        // 这段老日志没有轮次标记，归成一段：组头 + 4 条 + 3 条分隔线
        assertEquals(8, body.getChildCount());
        TextView subtitle = a.findViewById(R.id.journal_subtitle);
        assertEquals("4 条 · 1 次失败", subtitle.getText().toString());
        shot(a, "23-journal-night");
    }
}
