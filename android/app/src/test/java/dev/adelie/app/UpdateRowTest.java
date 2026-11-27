package dev.adelie.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import com.google.android.material.bottomnavigation.BottomNavigationView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

/**
 * 设置 → 关于里的「检查更新」那一行：没查过、已是最新、有新版本三种样子。
 * 这里不联网：直接摆好上次检查的结果，看界面说的是不是那句话。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class UpdateRowTest {

    private Context ctx = ApplicationProvider.getApplicationContext();

    private void remember(String seenVersion) {
        ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE).edit()
                .putString("update_seen", seenVersion)
                .putLong("update_checked_at", System.currentTimeMillis())
                .commit();
    }

    private String currentVersion() throws Exception {
        return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
    }

    private MainActivity openSettings() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        ((BottomNavigationView) a.findViewById(R.id.nav)).setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        return a;
    }

    private boolean hasText(View root, String text) {
        if (root instanceof TextView) {
            CharSequence value = ((TextView) root).getText();
            if (value != null && value.toString().equals(text)) return true;
        }
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (hasText(group.getChildAt(i), text)) return true;
            }
        }
        return false;
    }

    @Test
    public void neverCheckedSaysSo() {
        SharedPreferences prefs = ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE);
        prefs.edit().remove("update_seen").putLong("update_checked_at", 0).commit();

        MainActivity a = openSettings();
        assertTrue(hasText(a.findViewById(R.id.settings_body), "未检查"));
    }

    @Test
    public void newerVersionIsOffered() {
        remember("99.0.0");
        MainActivity a = openSettings();
        assertTrue(hasText(a.findViewById(R.id.settings_body), "有新版本 99.0.0"));
    }

    @Test
    public void sameVersionReadsAsLatest() throws Exception {
        remember(currentVersion());
        MainActivity a = openSettings();
        assertTrue(hasText(a.findViewById(R.id.settings_body), "已是最新"));
        assertFalse(hasText(a.findViewById(R.id.settings_body), "未检查"));
    }
}
