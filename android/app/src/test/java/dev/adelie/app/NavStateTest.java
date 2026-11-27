package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.view.View;

import com.google.android.material.bottomnavigation.BottomNavigationView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

/**
 * 底部四个 tab 的选中状态。
 *
 * <p>曾经有个真机上看得见的毛病：第一页还没加载（WebView 停在 about:blank）时，
 * 切 tab 的同步逻辑把它当成「不在任何 tab 上」，把「对话」的选中清掉，
 * 底部就停在错的那一项（设置）上。这里把这个行为钉住。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class NavStateTest {

    private MainActivity launch() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        a.findViewById(R.id.splash).setVisibility(View.GONE);
        // 让 tick 至少跑一轮：以前就是在这一轮里把选中状态搞错的
        ShadowLooper.idleMainLooper();
        return a;
    }

    private BottomNavigationView nav(MainActivity a) {
        return a.findViewById(R.id.nav);
    }

    @Test
    public void firstLaunchKeepsChatSelected() {
        MainActivity a = launch();
        BottomNavigationView nav = nav(a);
        assertEquals(R.id.nav_chat, nav.getSelectedItemId());
        assertTrue(nav.getMenu().findItem(R.id.nav_chat).isChecked());
        assertFalse(nav.getMenu().findItem(R.id.nav_settings).isChecked());
        assertFalse(nav.getMenu().findItem(R.id.nav_agents).isChecked());
        assertFalse(nav.getMenu().findItem(R.id.nav_models).isChecked());
    }

    @Test
    public void tappingSettingsMovesTheSelection() {
        MainActivity a = launch();
        BottomNavigationView nav = nav(a);
        nav.setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();

        assertTrue(nav.getMenu().findItem(R.id.nav_settings).isChecked());
        assertFalse(nav.getMenu().findItem(R.id.nav_chat).isChecked());
        assertEquals(View.VISIBLE, a.findViewById(R.id.settings_page).getVisibility());
    }
}
