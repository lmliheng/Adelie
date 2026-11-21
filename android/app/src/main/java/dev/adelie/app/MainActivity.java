package dev.adelie.app;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.google.android.material.navigation.NavigationBarView;
import com.google.android.material.progressindicator.LinearProgressIndicator;

import java.io.File;
import java.util.List;

/**
 * 常规 Material 3 App 外壳：内容区（Adelie 自己的 Web 前端 / 原生设置页 / 日志浮层）
 * 加底部四个 tab。日志与重载收在「设置 → 开发者」里，界面上不占地方。
 *
 * WebView 只负责渲染，绝不对它做 alpha/位移动画 —— WebView 被合成进离屏图层后，
 * 滚动与重绘会留下残影（真机上就是「字叠在一起」）。
 */
public class MainActivity extends AppCompatActivity {
    private static final int REQ_NOTIFICATIONS = 1;

    private static final int TAB_CHAT = 0;
    private static final int TAB_AGENTS = 1;
    private static final int TAB_MODELS = 2;
    private static final int TAB_SETTINGS = 3;

    /** 设置是原生页面，所以这一项为 null。 */
    private static final String[] TAB_PATHS = {"/chat", "/agents", "/models", null};
    private static final int[] TAB_IDS = {R.id.nav_chat, R.id.nav_agents, R.id.nav_models, R.id.nav_settings};
    private static final int[] TAB_ICONS_OFF = {R.drawable.ic_nav_chat, R.drawable.ic_nav_agents,
            R.drawable.ic_nav_models, R.drawable.ic_nav_settings};
    private static final int[] TAB_ICONS_ON = {R.drawable.ic_nav_chat_filled, R.drawable.ic_nav_agents_filled,
            R.drawable.ic_nav_models_filled, R.drawable.ic_nav_settings_filled};

    private static final String PREFS = "adelie";
    private static final String PREF_DEVELOPER = "developer";

    private View banner;
    private TextView bannerText;
    private MaterialButton bannerRetry;
    private WebView web;
    private LinearProgressIndicator pageProgress;
    private ScrollView settingsPage;
    private LinearLayout settingsBody;
    private TextView settingsSubtitle;
    private LinearLayout logPanel;
    private ScrollView logScroll;
    private TextView logText;
    private BottomNavigationView nav;
    private View splash;
    private LinearLayout splashColumn;
    private TextView splashPhase;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private boolean developer;

    private int tab = TAB_CHAT;
    private boolean settingsShown;
    private boolean splashDone;
    private boolean pageLoaded;
    private boolean firstLoadStarted;
    private long readyAt;
    private String lastPath;
    private boolean navGuard;
    private GradientDrawable bgBannerOk;
    private GradientDrawable bgBannerErr;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            syncBanner();
            if (web != null && !firstLoadStarted) {
                // 服务端先打印监听端口、紧接着打印首登链接：多等一拍，别错过自动登录
                String target = null;
                if (Core.claimUrl != null) {
                    target = Core.claimUrl;
                } else if (Core.ready) {
                    if (readyAt == 0L) readyAt = System.currentTimeMillis();
                    if (System.currentTimeMillis() - readyAt > 1200) target = Core.baseUrl;
                }
                if (target != null) {
                    firstLoadStarted = true;
                    web.loadUrl(target);
                }
            }
            if (!settingsShown) syncTabFromUrl();
            if (logPanel.getVisibility() == View.VISIBLE) renderLog();
            maybeHideSplash();
            handler.postDelayed(this, 600);
        }
    };

    // ------------------------------------------------------------------ 生命周期

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        developer = prefs.getBoolean(PREF_DEVELOPER, false);

        banner = findViewById(R.id.banner);
        bannerText = findViewById(R.id.banner_text);
        bannerRetry = findViewById(R.id.banner_retry);
        web = findViewById(R.id.web);
        pageProgress = findViewById(R.id.page_progress);
        settingsPage = findViewById(R.id.settings_page);
        settingsBody = findViewById(R.id.settings_body);
        settingsSubtitle = findViewById(R.id.settings_subtitle);
        logPanel = findViewById(R.id.log_panel);
        logScroll = findViewById(R.id.log_scroll);
        logText = findViewById(R.id.log_text);
        nav = findViewById(R.id.nav);
        splash = findViewById(R.id.splash);
        splashColumn = findViewById(R.id.splash_column);
        splashPhase = findViewById(R.id.splash_phase);

        bgBannerOk = rounded(R.color.surface_muted);
        bgBannerErr = rounded(R.color.danger_container);
        setupBanner();
        setupWeb();
        setupNav();
        setupLogPanel();
        buildSettingsBody();
        startSplashAnimation();

        // 先把服务拉起来，再让界面等它
        startCore();

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }

        syncNav(TAB_CHAT);
        handler.post(tick);
    }

    private void setupBanner() {
        bannerRetry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Core.stop();
                firstLoadStarted = false;
                readyAt = 0L;
                pageLoaded = false;
                startCore();
            }
        });
    }

    /** API 26 才有 startForegroundService；7.0/7.1 上走普通的 startService。 */
    private void startCore() {
        Intent intent = new Intent(this, BootService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
        else startService(intent);
    }

    // ------------------------------------------------------------------ WebView

    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // 不要 useWideViewPort / loadWithOverviewMode：页面自带 width=device-width，
        // 再叠一层「先按 980px 排版再缩放」就会出现半行字被裁、字糊在一起。
        web.setBackgroundColor(getColor(R.color.surface));
        web.setVerticalScrollBarEnabled(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                syncTabFromUrl();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description,
                                        String failingUrl) {
                if (failingUrl != null && failingUrl.contains("/api/auth/claim")) {
                    // 首登链接只能换一次 cookie，刷新过就会失效；回到首页让会话 cookie 生效
                    if (Core.baseUrl != null) view.loadUrl(Core.baseUrl);
                } else {
                    pageLoaded = true;
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100) {
                    pageProgress.setVisibility(View.INVISIBLE);
                } else {
                    pageProgress.setVisibility(View.VISIBLE);
                    pageProgress.setProgressCompat(newProgress, true);
                }
            }
        });

        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true);   // adb forward 后 chrome://inspect
        }
    }

    // ------------------------------------------------------------------ 底部导航

    private void setupNav() {
        // 先定初始选中，再挂监听：否则 setSelectedItemId 会当成用户点了一次
        nav.setSelectedItemId(TAB_IDS[tab]);
        applyTabIcons(tab);
        nav.setOnItemSelectedListener(new NavigationBarView.OnItemSelectedListener() {
            @Override
            public boolean onNavigationItemSelected(@NonNull MenuItem item) {
                if (navGuard) return true;
                int index = indexOfTab(item.getItemId());
                if (index < 0) return false;
                selectTab(index);
                return true;
            }
        });
    }

    private int indexOfTab(int id) {
        for (int i = 0; i < TAB_IDS.length; i++) {
            if (TAB_IDS[i] == id) return i;
        }
        return -1;
    }

    /** 代码改选中态时不要反过来触发一遍导航。 */
    private void syncNav(int index) {
        navGuard = true;
        nav.setSelectedItemId(TAB_IDS[index]);
        navGuard = false;
        applyTabIcons(index);
    }

    private void applyTabIcons(int index) {
        for (int i = 0; i < TAB_IDS.length; i++) {
            MenuItem item = nav.getMenu().findItem(TAB_IDS[i]);
            if (item != null) item.setIcon(i == index ? TAB_ICONS_ON[i] : TAB_ICONS_OFF[i]);
        }
    }

    /** 停在非 tab 的网页页（例如从设置里打开「机器管理」）时，底部不假装选中某一项。 */
    private void clearNav() {
        navGuard = true;
        for (int i = 0; i < TAB_IDS.length; i++) {
            MenuItem item = nav.getMenu().findItem(TAB_IDS[i]);
            if (item != null) item.setChecked(false);
        }
        navGuard = false;
        applyTabIcons(-1);
    }

    private void selectTab(int index) {
        if (index == TAB_SETTINGS) {
            settingsShown = true;
            showLog(false);
            web.setVisibility(View.GONE);
            pageProgress.setVisibility(View.INVISIBLE);
            buildSettingsBody();
            settingsPage.setVisibility(View.VISIBLE);
            tab = TAB_SETTINGS;
            syncNav(TAB_SETTINGS);
            return;
        }

        settingsShown = false;
        settingsPage.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);

        String path = TAB_PATHS[index];
        String base = Core.baseUrl;
        tab = index;
        syncNav(index);
        if (base == null) {
            toast(getString(R.string.not_ready));
            return;
        }
        if (!path.equals(pathOf(web.getUrl()))) {
            if (!pageLoaded && Core.claimUrl != null) {
                // 首登链接还没走完，这时直接跳 tab 会丢掉换 cookie 的那一步
                toast("正在登录，稍等一下");
            } else {
                web.loadUrl(base + path);
            }
        }
    }

    /** 网页自己跳转（点链接、深链）之后，让底部 tab 跟上。 */
    private void syncTabFromUrl() {
        if (settingsShown || web == null) return;
        String path = pathOf(web.getUrl());
        if (path.equals(lastPath)) return;
        lastPath = path;
        int index = tabForPath(path);
        if (index >= 0) {
            tab = index;
            syncNav(index);
        } else {
            tab = -1;
            clearNav();
        }
    }

    private void openWebRoute(String path) {
        if (Core.baseUrl == null) {
            toast(getString(R.string.not_ready));
            return;
        }
        settingsShown = false;
        settingsPage.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadUrl(Core.baseUrl + path);
        syncTabFromUrl();
    }

    private int tabForPath(String path) {
        if (path == null) return -1;
        if (path.startsWith("/chat")) return TAB_CHAT;
        if (path.startsWith("/agents")) return TAB_AGENTS;
        if (path.startsWith("/models")) return TAB_MODELS;
        return -1;
    }

    private String pathOf(String url) {
        if (url == null) return "";
        String s = url;
        int scheme = s.indexOf("://");
        if (scheme >= 0) {
            s = s.substring(scheme + 3);
            int slash = s.indexOf('/');
            s = slash < 0 ? "/" : s.substring(slash);
        }
        int q = s.indexOf('?');
        if (q >= 0) s = s.substring(0, q);
        int h = s.indexOf('#');
        if (h >= 0) s = s.substring(0, h);
        return s;
    }

    // ------------------------------------------------------------------ 启动动画

    private void startSplashAnimation() {
        splashColumn.setAlpha(0f);
        splashColumn.setTranslationY(dp(14));
        splashColumn.animate().alpha(1f).translationY(0f)
                .setDuration(420).start();

        splash.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Core.baseUrl != null) hideSplash();
            }
        });
    }

    private void maybeHideSplash() {
        if (splashDone) return;
        String phase = Core.phase == null ? "" : Core.phase;
        boolean failed = phase.startsWith("启动失败") || phase.startsWith("服务已退出");
        boolean pageReady = pageLoaded || Core.baseUrl == null;
        if (failed || (Core.ready && pageReady)) hideSplash();
    }

    private void hideSplash() {
        if (splashDone) return;
        splashDone = true;
        splash.animate().alpha(0f).setDuration(260)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        splash.setVisibility(View.GONE);
                    }
                }).start();
    }

    // ------------------------------------------------------------------ 状态提示

    private void syncBanner() {
        String phase = Core.phase == null ? "" : Core.phase;
        boolean failed = phase.startsWith("启动失败") || phase.startsWith("服务已退出");
        splashPhase.setText(phase);

        if (Core.ready) {
            banner.setVisibility(View.GONE);
            return;
        }
        banner.setVisibility(View.VISIBLE);
        bannerText.setText(phase);
        bannerText.setTextColor(getColor(failed ? R.color.danger : R.color.ink_muted));
        banner.setBackground(failed ? bgBannerErr : bgBannerOk);
        bannerRetry.setVisibility(failed ? View.VISIBLE : View.GONE);
    }

    // ------------------------------------------------------------------ 设置页

    private void buildSettingsBody() {
        settingsBody.removeAllViews();
        settingsSubtitle.setText(getString(R.string.app_name) + " · " + getString(R.string.version_label));

        settingsBody.addView(sectionHeader(getString(R.string.section_workspace)));
        LinearLayout workspace = card();
        workspace.addView(linkRow(R.string.row_machines, R.string.row_machines_desc, "/machines"));
        workspace.addView(divider());
        workspace.addView(linkRow(R.string.row_plugins, R.string.row_plugins_desc, "/plugins"));
        workspace.addView(divider());
        workspace.addView(linkRow(R.string.row_usage, R.string.row_usage_desc, "/usage"));
        workspace.addView(divider());
        workspace.addView(linkRow(R.string.row_benchmark, R.string.row_benchmark_desc, "/benchmark"));
        settingsBody.addView(wrapCard(workspace));

        settingsBody.addView(sectionHeader(getString(R.string.section_developer)));
        LinearLayout dev = card();
        dev.addView(switchRow());
        if (developer) {
            dev.addView(divider());
            dev.addView(actionRow(R.string.row_log, R.string.row_log_desc, 1));
            dev.addView(divider());
            dev.addView(actionRow(R.string.row_reload, R.string.row_reload_desc, 2));
            dev.addView(divider());
            dev.addView(actionRow(R.string.row_copy_log, R.string.row_copy_log_desc, 3));
        }
        settingsBody.addView(wrapCard(dev));

        settingsBody.addView(sectionHeader(getString(R.string.section_about)));
        LinearLayout about = card();
        about.addView(infoRow(R.string.row_version, getString(R.string.version_label), null));
        about.addView(divider());
        about.addView(infoRow(R.string.row_runtime, "Node 24.22.3 · arm64 · small-icu", null));
        about.addView(divider());
        about.addView(infoRow(R.string.row_package, getPackageName(), null));
        about.addView(divider());
        final String dataDir = new File(getFilesDir(), "adelie").getAbsolutePath();
        about.addView(infoRow(R.string.row_data_dir, dataDir, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copy(dataDir);
            }
        }));
        about.addView(divider());
        about.addView(infoRow(R.string.row_server,
                Core.baseUrl == null ? "尚未启动" : Core.baseUrl, null));
        settingsBody.addView(wrapCard(about));
    }

    private TextView sectionHeader(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(13);
        t.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        t.setLetterSpacing(0.01f);
        t.setTextColor(getColor(R.color.ink_muted));
        t.setPadding(dp(20), dp(22), dp(20), dp(8));
        return t;
    }

    private LinearLayout card() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    private View wrapCard(View inner) {
        MaterialCardView card = new MaterialCardView(this);
        card.setCardElevation(0f);
        card.setRadius(dp(16));
        card.setStrokeWidth(dp(1));
        card.setStrokeColor(ColorStateList.valueOf(getColor(R.color.divider)));
        card.setCardBackgroundColor(ColorStateList.valueOf(getColor(R.color.surface)));
        card.addView(inner, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(16);
        lp.rightMargin = dp(16);
        lp.topMargin = dp(2);
        lp.bottomMargin = dp(4);
        card.setLayoutParams(lp);
        return card;
    }

    private View divider() {
        View v = new View(this);
        v.setBackgroundColor(getColor(R.color.divider));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(0.5f)));
        lp.leftMargin = dp(16);
        lp.rightMargin = dp(16);
        v.setLayoutParams(lp);
        return v;
    }

    private View linkRow(int titleRes, int descRes, final String path) {
        View row = inflateRow(getString(titleRes), getString(descRes), true);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openWebRoute(path);
            }
        });
        return row;
    }

    private View actionRow(int titleRes, int descRes, final int action) {
        View row = inflateRow(getString(titleRes), getString(descRes), false);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                runDeveloperAction(action);
            }
        });
        return row;
    }

    private View switchRow() {
        View row = LayoutInflater.from(this).inflate(R.layout.item_row, settingsBody, false);
        ((TextView) row.findViewById(R.id.row_title)).setText(getString(R.string.row_developer));
        TextView desc = row.findViewById(R.id.row_desc);
        desc.setText(getString(R.string.row_developer_desc));
        desc.setVisibility(View.VISIBLE);
        MaterialSwitch sw = row.findViewById(R.id.row_switch);
        sw.setVisibility(View.VISIBLE);
        sw.setChecked(developer);
        sw.setOnCheckedChangeListener(new android.widget.CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(android.widget.CompoundButton buttonView, boolean isChecked) {
                developer = isChecked;
                prefs.edit().putBoolean(PREF_DEVELOPER, isChecked).apply();
                // 正在派发的这一下点击里不能重建整个列表，等这一帧过去再说
                settingsBody.post(new Runnable() {
                    @Override
                    public void run() {
                        buildSettingsBody();
                    }
                });
            }
        });
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                MaterialSwitch sw = v.findViewById(R.id.row_switch);
                sw.setChecked(!sw.isChecked());
            }
        });
        return row;
    }

    private View inflateRow(String title, String desc, boolean chevron) {
        View row = LayoutInflater.from(this).inflate(R.layout.item_row, settingsBody, false);
        ((TextView) row.findViewById(R.id.row_title)).setText(title);
        TextView descView = row.findViewById(R.id.row_desc);
        if (desc != null && desc.length() > 0) {
            descView.setText(desc);
            descView.setVisibility(View.VISIBLE);
        }
        row.findViewById(R.id.row_chevron)
                .setVisibility(chevron ? View.VISIBLE : View.GONE);
        return row;
    }

    private View infoRow(int titleRes, String value, View.OnClickListener click) {
        // 短值放右侧（经典设置行）；长值（路径、版本串）放到标题下面，别用省略号截断
        boolean longValue = value != null && value.length() > 14;
        View row = inflateRow(getString(titleRes), longValue ? value : null, false);
        if (!longValue) {
            TextView v = row.findViewById(R.id.row_value);
            v.setText(value);
            v.setVisibility(View.VISIBLE);
        }
        row.setClickable(click != null);
        if (click != null) row.setOnClickListener(click);
        else row.setBackground(null);
        return row;
    }

    private void runDeveloperAction(int action) {
        if (action == 1) {
            showLog(true);
        } else if (action == 2) {
            if (web != null) web.reload();
            toast("正在重新加载");
        } else if (action == 3) {
            copy(joinLog());
        }
    }

    // ------------------------------------------------------------------ 日志浮层

    private void setupLogPanel() {
        MaterialButton copyBtn = logPanel.findViewById(R.id.log_copy);
        copyBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copy(joinLog());
            }
        });
        MaterialButton closeBtn = logPanel.findViewById(R.id.log_close);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showLog(false);
            }
        });
    }

    private void showLog(boolean show) {
        logPanel.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) {
            logPanel.bringToFront();
            renderLog();
        }
    }

    private String joinLog() {
        StringBuilder sb = new StringBuilder();
        List<String> lines = Core.lines();
        for (int i = 0; i < lines.size(); i++) sb.append(lines.get(i)).append('\n');
        return sb.toString();
    }

    private void renderLog() {
        List<String> lines = Core.lines();
        StringBuilder sb = new StringBuilder();
        int from = Math.max(0, lines.size() - 400);
        for (int i = from; i < lines.size(); i++) sb.append(lines.get(i)).append('\n');
        boolean atBottom = false;
        View child = logScroll.getChildAt(0);
        if (child != null) {
            atBottom = logScroll.getScrollY() + logScroll.getHeight() + dp(24) >= child.getHeight();
        }
        logText.setText(sb.toString());
        if (atBottom) {
            logScroll.post(new Runnable() {
                @Override
                public void run() {
                    View c = logScroll.getChildAt(0);
                    if (c != null) logScroll.scrollTo(0, c.getHeight());
                }
            });
        }
    }

    // ------------------------------------------------------------------ 杂项

    private GradientDrawable rounded(int colorRes) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(getColor(colorRes));
        d.setCornerRadius(dp(12));
        return d;
    }

    private void copy(String text) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Adelie", text));
        toast(getString(R.string.copied));
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    private int dp(float v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    @Override
    public void onBackPressed() {
        if (logPanel.getVisibility() == View.VISIBLE) {
            showLog(false);
            return;
        }
        if (settingsShown) {
            selectTab(TAB_CHAT);
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        if (tab != TAB_CHAT) {
            selectTab(TAB_CHAT);
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(tick);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
