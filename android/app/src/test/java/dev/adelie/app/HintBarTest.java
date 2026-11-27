package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.robolectric.Shadows.shadowOf;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

/**
 * 首屏那条提醒：先说最要紧的那件（无障碍），说完了换下一件（电池、通知），
 * 每一件都能单独关掉、且只关到本版本。
 *
 * <p>这条提醒存在的理由：装上就停在对话页的人根本不会翻设置，而这三件事没办成时
 * 「怎么点了没反应 / 后台怎么没了 / 进度在哪」都是必然会遇到的困惑。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class HintBarTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        accessibility(null);
        // 默认把电池与通知这两件事设成「没问题」，需要它们的用例再单独改
        batteryOptimized(false);
        notificationsOn(true);
        prefs().edit().clear().commit();
    }

    private SharedPreferences prefs() {
        return ctx.getSharedPreferences("adelie", Context.MODE_PRIVATE);
    }

    private void accessibility(String value) {
        Settings.Secure.putString(ctx.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, value);
    }

    private void enableAccessibility() {
        accessibility("dev.adelie.app/dev.adelie.app.control.AdelieAccessibilityService");
    }

    /** true = 被电池优化管着（提醒条要说话）。 */
    private void batteryOptimized(boolean optimized) {
        shadowOf((PowerManager) ctx.getSystemService(Context.POWER_SERVICE))
                .setIgnoringBatteryOptimizations(ctx.getPackageName(), !optimized);
    }

    private void notificationsOn(boolean on) {
        shadowOf((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE))
                .setNotificationsEnabled(on);
    }

    /**
     * 提醒条要等核心服务起来才出现（之前让位给顶上那条 banner），所以先把 Core 摆成就绪状态
     * 再建界面 —— 不然 onCreate 那一刻还看不到提醒条。
     */
    private ActivityController<MainActivity> launch() {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        ShadowLooper.idleMainLooper();
        return c;
    }

    private View bar(MainActivity a) {
        return a.findViewById(R.id.hint_bar);
    }

    private String barText(MainActivity a) {
        return ((TextView) a.findViewById(R.id.hint_text)).getText().toString();
    }

    /**
     * 服务还没起来（或起失败了）时顶上那条 banner 在说话，提醒条先躲开：
     * 两条顶栏叠在一起，用户不知道该看哪条。
     */
    @Test
    public void hintWaitsUntilTheCoreIsReady() {
        Core.ready = false;
        Core.phase = "正在启动 Adelie";
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        ShadowLooper.idleMainLooper();

        assertEquals(View.VISIBLE, a.findViewById(R.id.banner).getVisibility());
        assertEquals(View.GONE, bar(a).getVisibility());

        Core.ready = true;
        a.onResume();
        assertEquals(View.VISIBLE, bar(a).getVisibility());
        assertEquals(a.getString(R.string.hint_accessibility), barText(a));
    }

    @Test
    public void startsWithTheAccessibilityHint() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(View.VISIBLE, bar(a).getVisibility());
        assertEquals(a.getString(R.string.hint_accessibility), barText(a));
    }

    /** 无障碍开了就该说下一件事（电池），而不是干脆不说话了。 */
    @Test
    public void movesOnToBatteryOnceAccessibilityIsOn() {
        enableAccessibility();
        batteryOptimized(true);
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(View.VISIBLE, bar(a).getVisibility());
        assertEquals(a.getString(R.string.hint_battery), barText(a));

        a.findViewById(R.id.hint_open).performClick();
        Intent next = shadowOf(a).getNextStartedActivity();
        assertNotNull(next);
        assertEquals(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, next.getAction());
        assertEquals("package:dev.adelie.app", String.valueOf(next.getData()));
    }

    @Test
    public void movesOnToNotificationsLast() {
        enableAccessibility();
        batteryOptimized(false);
        notificationsOn(false);
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(a.getString(R.string.hint_notifications), barText(a));

        a.findViewById(R.id.hint_open).performClick();
        Intent next = shadowOf(a).getNextStartedActivity();
        assertNotNull(next);
        assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, next.getAction());
    }

    @Test
    public void hidesWhenEverythingIsReady() {
        enableAccessibility();
        ActivityController<MainActivity> c = launch();
        assertEquals(View.GONE, bar(c.get()).getVisibility());
    }

    @Test
    public void openButtonGoesToAccessibilitySettings() {
        ActivityController<MainActivity> c = launch();
        c.get().findViewById(R.id.hint_open).performClick();
        Intent next = shadowOf(c.get()).getNextStartedActivity();
        assertNotNull(next);
        assertEquals(Settings.ACTION_ACCESSIBILITY_SETTINGS, next.getAction());
    }

    /** 关掉只关「这一件」：无障碍那条关了，电池该说还得说。 */
    @Test
    public void dismissingOneItemDoesNotSilenceTheOthers() {
        batteryOptimized(true);
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(a.getString(R.string.hint_accessibility), barText(a));

        a.findViewById(R.id.hint_close).performClick();
        assertEquals(View.GONE, bar(a).getVisibility());
        assertEquals(MainActivity.versionTag(ctx), prefs().getString(
                MainActivity.hintPrefKey(SetupChecks.ACCESSIBILITY), ""));

        // 用户把无障碍开了：电池那条接着提醒
        enableAccessibility();
        c.pause().resume();
        assertEquals(View.VISIBLE, bar(a).getVisibility());
        assertEquals(a.getString(R.string.hint_battery), barText(a));
    }

    /** 关掉的记录带版本号：这个版本不再提，升级到新版本会再提醒一次。 */
    @Test
    public void dismissalOnlyLastsForThisVersion() {
        ActivityController<MainActivity> c = launch();
        c.get().findViewById(R.id.hint_close).performClick();
        assertEquals(View.GONE, bar(c.get()).getVisibility());
        c.pause().stop().destroy();

        ActivityController<MainActivity> again = launch();
        assertEquals(View.GONE, bar(again.get()).getVisibility());
        again.pause().stop().destroy();

        // 上次是旧版本关的：新版本装上来还得再说一次
        prefs().edit().putString(MainActivity.hintPrefKey(SetupChecks.ACCESSIBILITY),
                "1.0.0-beta").commit();
        ActivityController<MainActivity> third = launch();
        assertEquals(View.VISIBLE, bar(third.get()).getVisibility());
    }

    /** 1.1.2 及更早只有一个总开关，升级后不能立刻把已经关过的无障碍提醒又弹回来。 */
    @Test
    public void legacyDismissalStillCounts() {
        prefs().edit().putString("hint_dismissed_version", MainActivity.versionTag(ctx)).commit();
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(View.GONE, bar(a).getVisibility());
        assertEquals(MainActivity.versionTag(ctx),
                prefs().getString(MainActivity.hintPrefKey(SetupChecks.ACCESSIBILITY), ""));
    }

    /** 设置页上「准备检查」已经写了同一件事，那里不再挂这条。 */
    @Test
    public void staysOffTheSettingsPage() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        com.google.android.material.bottomnavigation.BottomNavigationView nav =
                a.findViewById(R.id.nav);
        nav.setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        assertEquals(View.GONE, bar(a).getVisibility());

        nav.setSelectedItemId(R.id.nav_chat);
        ShadowLooper.idleMainLooper();
        assertEquals(View.VISIBLE, bar(a).getVisibility());
    }

    /** 从系统设置里开了无障碍再回来：提醒条自己消失，不用杀进程重开。 */
    @Test
    public void disappearsAfterComingBackFromSystemSettings() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(View.VISIBLE, bar(a).getVisibility());
        enableAccessibility();
        c.pause().resume();
        assertEquals(View.GONE, bar(a).getVisibility());
    }

    /** 三件事的好坏组合里，永远只说最要紧的那一件。 */
    @Test
    public void alwaysSpeaksAboutTheMostImportantItem() {
        batteryOptimized(true);
        notificationsOn(false);
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        assertEquals(a.getString(R.string.hint_accessibility), barText(a));

        enableAccessibility();
        c.pause().resume();
        assertEquals(a.getString(R.string.hint_battery), barText(a));

        batteryOptimized(false);
        c.pause().resume();
        assertEquals(a.getString(R.string.hint_notifications), barText(a));

        notificationsOn(true);
        c.pause().resume();
        assertEquals(View.GONE, bar(a).getVisibility());
    }
}
