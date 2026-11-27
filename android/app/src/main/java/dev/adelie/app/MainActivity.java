package dev.adelie.app;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
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

import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.google.android.material.navigation.NavigationBarView;
import com.google.android.material.progressindicator.LinearProgressIndicator;

import java.io.File;
import java.io.FileInputStream;
import java.util.List;

import dev.adelie.app.control.ControlServer;
import dev.adelie.app.control.Drill;
import dev.adelie.app.control.PhoneControl;
import dev.adelie.app.control.PhoneSkill;
import dev.adelie.app.control.Projection;

/**
 * 常规 Material 3 App 外壳：内容区（Adelie 自己的 Web 前端 / 原生设置页 / 日志浮层）
 * 加底部四个 tab。日志与重载收在「设置 → 开发者」里，界面上不占地方。
 *
 * WebView 只负责渲染，绝不对它做 alpha/位移动画 —— WebView 被合成进离屏图层后，
 * 滚动与重绘会留下残影（真机上就是「字叠在一起」）。
 */
public class MainActivity extends AppCompatActivity {
    private static final int REQ_NOTIFICATIONS = 1;
    /** 网页里 <input type="file"> 选文件走系统的选择器；单测也按这个号发结果。 */
    static final int REQ_FILE_CHOOSER = 3;
    /** 从「更新失败」那条通知点「重新下载」回来时带这个 extra。 */
    static final String EXTRA_RETRY_UPDATE = "retry_update";
    /** 从「这一轮操作完成了」那条回执点进来时带这个 extra：直接开回放页。 */
    public static final String EXTRA_OPEN_JOURNAL = "open_journal";

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
    private static final String PREF_CONTROL_ALLOW_ALL = "control_allow_all";
    private static final String PREF_CONTROL_GLOW = "control_glow";
    private static final String PREF_CONTROL_APPS = "control_apps";
    /** 首屏提醒被关掉时按项目记下版本号（键是 前缀+项目名）：同一个版本不再提，升级后再提一次。 */
    static final String PREF_HINT_DISMISSED = "hint_dismissed";
    /** 1.1.2 及更早只有一个总开关，键名就是它自己；升级时把它当成「无障碍已关掉」。 */
    private static final String PREF_HINT_LEGACY = "hint_dismissed_version";
    private static final String PREF_UPDATE_SEEN = "update_seen";
    private static final String PREF_UPDATE_AT = "update_checked_at";
    /** 已经提示过的那次崩溃（存崩溃文件的时间戳）：同一个现场只提示一次。 */
    private static final String PREF_CRASH_SEEN = "crash_seen_at";
    /** 上一次「手机操控演练」的结果：设置页那一行要能一直显示到下一次演练 */
    private static final String PREF_DRILL = "control_drill_report";
    private static final String PREF_DRILL_OK = "control_drill_ok";
    /** 自动检查的间隔：一天一次就够，别每次开屏都去戳发布站。 */
    private static final long UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000L;

    private View banner;
    private TextView bannerText;
    private MaterialButton bannerRetry;
    private View hintBar;
    private TextView hintText;
    private MaterialButton hintOpen;
    private MaterialButton hintClose;
    /** 当前版本号，用来判断「这条提醒是不是已经在本版本关过了」。 */
    private String versionTag;
    /** 提醒条上现在说的是哪一件事（SetupChecks 的 key）；null = 没有要提醒的。 */
    private String hintKey;
    private WebView web;
    private LinearProgressIndicator pageProgress;
    private ScrollView settingsPage;
    private LinearLayout settingsBody;
    private TextView settingsSubtitle;
    private LinearLayout logPanel;
    private ScrollView logScroll;
    private TextView logText;
    private View journalPage;
    private LinearLayout journalBody;
    private ScrollView journalScroll;
    private TextView journalSubtitle;
    private com.google.android.material.chip.Chip journalChipAll;
    private com.google.android.material.chip.Chip journalChipFailed;
    private com.google.android.material.chip.Chip journalChipLatest;
    private View journalAppRow;
    private com.google.android.material.chip.Chip journalChipApp;
    /** 只看某个应用（前台包的包名）；null = 不按应用过滤。可以和「只看失败」「最近一轮」叠着用。 */
    private String journalAppFilter;
    private android.widget.HorizontalScrollView journalActionScroll;
    private com.google.android.material.chip.ChipGroup journalActionGroup;
    /** 只看某一类动作（人话名，`PhoneControl.label()` 的结果，如「点按」）；null = 不按动作过滤。 */
    private String journalActionFilter;
    private com.google.android.material.textfield.TextInputEditText journalSearch;
    /** 回放页的搜索词（空 = 不搜）：步骤文字、动作名、应用名、错误码都参与匹配。 */
    private String journalQuery = "";
    private BottomNavigationView nav;
    private View splash;
    private LinearLayout splashColumn;
    private TextView splashPhase;
    private boolean updateChecking;
    /** 这一次检查是新版就直接下（从「重新下载」那条通知点进来的），不再弹一遍对话框。 */
    private boolean autoDownloadOnce;
    private boolean updateAutoChecked;
    /** 网页点了「选文件」，正等系统选择器回来；同一时间只会有一个。 */
    private android.webkit.ValueCallback<android.net.Uri[]> fileCallback;
    /** 网页里那段录像最长几秒、最大多少字节（相机应用认这两个附加值才生效）。 */
    private static final int VIDEO_MAX_SECONDS = 30;
    private static final long VIDEO_MAX_BYTES = 48L * 1024 * 1024;
    /** 这一次「拍照」的输出地址与文件；选了文件或取消时清空。 */
    private android.net.Uri captureUri;
    private File captureFile;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private boolean developer;

    private int tab = TAB_CHAT;
    private boolean settingsShown;
    private boolean journalShown;
    private boolean journalOnlyFailed;
    /** 只看最近一轮（最新那次任务），日志攒多了之后用。 */
    private boolean journalLatestOnly;
    /**
     * 只看某一轮（点段头筛过去的）：`task` 字段的值，0 是「更早的记录」那种不属于任务的步骤；
     * null = 不按轮次过滤。和「只看失败」「只看某个动作」叠着用。
     */
    private Long journalTaskFilter;
    /** 那一轮在副标题里的写法（「14:32:05」或「更早的记录」）。 */
    private String journalTaskFilterLabel;
    /** 回执通知点进来时留的标记：视图还没搭好，等 onCreate / onNewIntent 里再开回放页。 */
    private boolean pendingJournal;
    /** 设置页「走一遍看看」那一行，演练完要更新它右边的结果 */
    private View drillRow;
    private boolean drillOk;

    /** 分享进来的文字：页面还没就绪就先攥着，等对话页出来再塞进输入框。 */
    private String pendingShare;
    /** 已经往页面里塞过一次，别在每次 onPageFinished 里重复塞。 */
    private boolean shareAttempted;
    /** 已经为了塞分享内容往对话页跳过一次。 */
    private boolean shareNavigated;
    private boolean splashDone;
    private boolean pageLoaded;
    private boolean firstLoadStarted;
    private long readyAt;
    private long lastSkillSync;
    private String lastPath;
    private boolean navGuard;
    private GradientDrawable bgBannerOk;
    private GradientDrawable bgBannerErr;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            syncBanner();
            syncHintBar();
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
            if (Core.ready && System.currentTimeMillis() - lastSkillSync > 60000) {
                lastSkillSync = System.currentTimeMillis();
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        ControlServer.republishPortFile(getApplicationContext());
                        PhoneSkill.ensure(getApplicationContext());
                    }
                }, "adelie-skill").start();
            }
            if (!settingsShown && !journalShown) syncTabFromUrl();
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
        // 先装崩溃兜底：后面这一大段初始化里崩了，下次开机才有话可说
        CrashLog.install(getApplicationContext());
        handleLaunchIntent(getIntent());
        developer = prefs.getBoolean(PREF_DEVELOPER, false);
        PhoneControl.setDefaultAllowAll(prefs.getBoolean(PREF_CONTROL_ALLOW_ALL, false));
        // 点过「以后都允许」的应用（确认卡上那个按钮）也跟着回来
        PhoneControl.loadTrusted(this);
        PhoneControl.setEdgeGlow(prefs.getBoolean(PREF_CONTROL_GLOW, true));
        java.util.Set<String> allowed = prefs.getStringSet(PREF_CONTROL_APPS, null);
        if (allowed != null) PhoneControl.setAllowedPackages(allowed.toArray(new String[0]));

        notePreviousCrash();
        banner = findViewById(R.id.banner);
        bannerText = findViewById(R.id.banner_text);
        bannerRetry = findViewById(R.id.banner_retry);
        hintBar = findViewById(R.id.hint_bar);
        hintText = findViewById(R.id.hint_text);
        hintOpen = findViewById(R.id.hint_open);
        hintClose = findViewById(R.id.hint_close);
        versionTag = versionTag(this);
        web = findViewById(R.id.web);
        pageProgress = findViewById(R.id.page_progress);
        settingsPage = findViewById(R.id.settings_page);
        settingsBody = findViewById(R.id.settings_body);
        settingsSubtitle = findViewById(R.id.settings_subtitle);
        logPanel = findViewById(R.id.log_panel);
        logScroll = findViewById(R.id.log_scroll);
        logText = findViewById(R.id.log_text);
        journalPage = findViewById(R.id.journal_page);
        journalBody = findViewById(R.id.journal_body);
        journalScroll = findViewById(R.id.journal_scroll);
        journalSubtitle = findViewById(R.id.journal_subtitle);
        journalChipAll = findViewById(R.id.journal_chip_all);
        journalChipFailed = findViewById(R.id.journal_chip_failed);
        journalChipLatest = findViewById(R.id.journal_chip_latest);
        journalAppRow = findViewById(R.id.journal_app_row);
        journalChipApp = findViewById(R.id.journal_chip_app);
        journalActionScroll = findViewById(R.id.journal_action_scroll);
        journalActionGroup = findViewById(R.id.journal_action_row);
        journalSearch = findViewById(R.id.journal_search);
        nav = findViewById(R.id.nav);
        splash = findViewById(R.id.splash);
        splashColumn = findViewById(R.id.splash_column);
        splashPhase = findViewById(R.id.splash_phase);
        ((TextView) findViewById(R.id.splash_version)).setText(versionLabel(this));

        bgBannerOk = rounded(R.color.surface_muted);
        bgBannerErr = rounded(R.color.danger_container);
        setupBanner();
        setupHintBar();
        syncHintBar();
        setupWeb();
        // 别的应用「分享」一段文字进来：先记下，对话页一就绪就塞进输入框
        handleShareIntent(getIntent());
        setupNav();
        setupLogPanel();
        setupJournalPage();
        buildSettingsBody();
        startSplashAnimation();

        // 手机操控的本地控制口（127.0.0.1，随机端口）：先开着，界面里能看到端口
        ControlServer.start(this);

        // 先把服务拉起来，再让界面等它
        startCore();

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }

        syncNav(TAB_CHAT);
        handler.post(tick);
        // 从回执通知点进来：视图都搭好了，直接落到回放页
        applyPendingJournal();
        // 开屏几秒后偷偷看一眼有没有新版：一天最多一次，没网就算了
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (updateAutoChecked) return;
                updateAutoChecked = true;
                if (System.currentTimeMillis() - prefs.getLong(PREF_UPDATE_AT, 0) > UPDATE_INTERVAL_MS) {
                    checkForUpdate(false);
                }
            }
        }, 4000);
    }

    // ------------------------------------------------------------------ 分享进来

    /** 分享进来的文字最多留这么多：再长就不是「一段话」了，塞进输入框也没人要。 */
    static final int SHARE_MAX = 8000;
    /** 一次最多转几个文件过来：再多就不是「让 Adelie 看一眼」了。 */
    static final int SHARE_MAX_FILES = 5;
    /** 单个文件的上限：几张照片的量级，再大就让用户走别的路。 */
    static final long SHARE_MAX_FILE_BYTES = 32L * 1024 * 1024;
    /** 页面迟迟不就绪（首次解包时很常见）：到点就换成复制兜底，别让内容白丢。 */
    private static final long SHARE_TIMEOUT_MS = 12000;

    private final Runnable shareTimeout = new Runnable() {
        @Override
        public void run() {
            if (pendingShare != null) onSharePlaced(false);
        }
    };

    /**
     * 从分享意图里取出要放进输入框的文字。
     *
     * <p>只认 {@code ACTION_SEND} + {@code text/*}：别家应用「分享」一段话、一个链接时给的就是这个。
     * 没有正文、不是文字类、或者本来就不是分享，一律当没有 —— 别为了一个空分享去打扰用户。
     */
    static String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType() == null ? "" : intent.getType();
        if (!type.isEmpty() && !type.startsWith("text/")) return null;
        return shareCaption(intent);
    }

    /** 分享时附带的说明文字（图片分享常有，比如一段正文）。没有就 null。 */
    static String shareCaption(Intent intent) {
        if (intent == null) return null;
        CharSequence seq = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String text = seq == null ? "" : seq.toString().trim();
        if (text.isEmpty()) return null;
        if (text.length() > SHARE_MAX) text = text.substring(0, SHARE_MAX) + "…";
        return text;
    }

    /**
     * 分享意图里带的文件：{@code EXTRA_STREAM} 一份或多份，有的应用只往 {@code ClipData} 里塞，
     * 两种都收（去重、最多 {@link #SHARE_MAX_FILES} 个）。不是分享就是空表。
     */
    static java.util.List<android.net.Uri> sharedUris(Intent intent) {
        java.util.List<android.net.Uri> found = new java.util.ArrayList<>();
        if (intent == null) return found;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return found;
        }
        try {
            android.os.Parcelable single = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (single instanceof android.net.Uri) found.add((android.net.Uri) single);
        } catch (Exception ignored) {
        }
        try {
            java.util.ArrayList<android.net.Uri> many =
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) {
                for (android.net.Uri u : many) {
                    if (u != null) found.add(u);
                }
            }
        } catch (Exception ignored) {
        }
        android.content.ClipData clip = intent.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                android.net.Uri u = clip.getItemAt(i).getUri();
                if (u != null) found.add(u);
            }
        }
        java.util.List<android.net.Uri> out = new java.util.ArrayList<>();
        for (android.net.Uri u : found) {
            if (out.size() >= SHARE_MAX_FILES) break;
            if (!out.contains(u)) out.add(u);
        }
        return out;
    }

    /** 接住一次分享：纯文字直接塞；带文件的先把内容取回来（可能要几秒），取到再塞。 */
    void handleShareIntent(Intent intent) {
        final String caption = shareCaption(intent);
        final String text = sharedText(intent);
        final java.util.List<android.net.Uri> uris = sharedUris(intent);
        if (text == null && uris.isEmpty()) return;
        if (uris.isEmpty()) {
            placeShare(text);
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                int[] lost = new int[1];
                final String composed = saveShared(uris, caption, lost);
                final String message = composed.isEmpty() ? null : composed;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (lost[0] > 0) {
                            toast(getString(R.string.share_files_lost, lost[0]));
                        }
                        if (message == null) {
                            pendingShare = null;
                            return;
                        }
                        placeShare(message);
                    }
                });
            }
        }, "adelie-share").start();
    }

    /**
     * 把分享进来的文件一个个取回来，落在 {@code cache/share}（和网页下载、导出的日志同一个地方，
     * 设置 → 关于的「临时文件」里看得见也清得掉），返回要放进输入框的每一行。
     *
     * <p>取不到的数量记在 {@code lostOut[0]} 里：一张图的分享没取到，比默默吞掉好。
     */
    String saveShared(java.util.List<android.net.Uri> uris, String caption, int[] lostOut) {
        java.util.List<String> lines = new java.util.ArrayList<>();
        File dir = new File(getCacheDir(), CacheClean.DIR_SHARE);
        for (android.net.Uri uri : uris) {
            File file = null;
            String mime = null;
            try {
                mime = getContentResolver().getType(uri);
                file = copySharedFile(getContentResolver(), uri, dir,
                        displayName(uri), SHARE_MAX_FILE_BYTES);
            } catch (Exception e) {
                file = null;
            }
            if (file == null) {
                if (lostOut != null && lostOut.length > 0) lostOut[0]++;
                continue;
            }
            lines.add(getString(shareTag(mime)) + " " + file.getAbsolutePath());
        }
        return composeShare(caption, lines);
    }

    /**
     * 把一个分享进来的文件拷进 {@code dir}。
     *
     * @return 落好的文件；取不到、空文件、超过 {@code max} 字节都返回 null（半截的不留）。
     */
    static File copySharedFile(android.content.ContentResolver resolver, android.net.Uri uri,
                               File dir, String name, long max) throws Exception {
        if (resolver == null || uri == null || dir == null) return null;
        InputStream in = null;
        OutputStream out = null;
        File target = null;
        try {
            in = resolver.openInputStream(uri);
            if (in == null) return null;
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            target = new File(dir, sharedFileName(uri, name));
            out = new FileOutputStream(target);
            byte[] buf = new byte[1 << 16];
            long total = 0;
            int n;
            try {
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > max) {
                        out.close();
                        out = null;
                        target.delete();
                        return null;
                    }
                    out.write(buf, 0, n);
                }
            } catch (Exception e) {
                // 读到一半断了（来源被回收、provider 报错）：半截文件不留，当没取到
                out.close();
                out = null;
                target.delete();
                return null;
            }
            if (total == 0) {
                out.close();
                out = null;
                target.delete();
                return null;
            }
            return target;
        } finally {
            closeQuietly(in, out);
        }
    }

    /** 落盘用的文件名：时间戳打头避免撞名，原来的名字里不能带路径分隔符。 */
    static String sharedFileName(android.net.Uri uri, String name) {
        String base = name == null ? "" : name.trim();
        if (base.isEmpty() && uri != null) base = String.valueOf(uri.getLastPathSegment());
        base = base.replace('/', '_').replace('\\', '_').replace(':', '_');
        if (base.isEmpty() || "null".equals(base)) base = "file";
        if (base.length() > 60) {
            int dot = base.lastIndexOf('.');
            String ext = dot > 0 && base.length() - dot <= 8 ? base.substring(dot) : "";
            base = base.substring(0, 60) + ext;
        }
        return System.currentTimeMillis() + "-" + base;
    }

    /** 内容提供方给的显示名；问不到就拿 URI 最后一段顶上。 */
    private String displayName(android.net.Uri uri) {
        if (uri == null) return null;
        android.database.Cursor c = null;
        try {
            c = getContentResolver().query(uri,
                    new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return null;
    }

    /** 图片和别的文件在输入框里写不同的开头，用户一眼知道转过来的是什么。 */
    static int shareTag(String mime) {
        return mime != null && mime.startsWith("image/")
                ? R.string.share_image_tag : R.string.share_file_tag;
    }

    /** 分享的说明文字在前，一行一个文件；两样都没有就是空串。 */
    static String composeShare(String caption, java.util.List<String> lines) {
        StringBuilder sb = new StringBuilder();
        if (caption != null && !caption.isEmpty()) sb.append(caption);
        if (lines != null) {
            for (String line : lines) {
                if (line == null || line.isEmpty()) continue;
                if (sb.length() > 0) sb.append('\n');
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static void closeQuietly(InputStream in, OutputStream out) {
        if (in != null) {
            try {
                in.close();
            } catch (Exception ignored) {
            }
        }
        if (out != null) {
            try {
                out.close();
            } catch (Exception ignored) {
            }
        }
    }

    /** 记下来，页面已经就绪就立刻往里塞。 */
    private void placeShare(String text) {
        if (text == null || text.isEmpty()) return;
        pendingShare = text;
        shareAttempted = false;
        shareNavigated = false;
        handler.removeCallbacks(shareTimeout);
        handler.postDelayed(shareTimeout, SHARE_TIMEOUT_MS);
        flushShare(web == null ? null : web.getUrl());
    }

    /**
     * 把分享的文字塞进对话输入框。
     *
     * <p>人分享时可能正停在智能体、模型页，所以先看看在不在对话页；不在就跳一次、等下一次
     * onPageFinished 再来。塞的动作交给页面自己做（React 的输入框只认原生 setter + input 事件），
     * 到底塞进去没有由桥回话。
     */
    void flushShare(String url) {
        if (pendingShare == null || shareAttempted || url == null) return;
        if (!url.contains("/chat")) {
            if (shareNavigated || Core.baseUrl == null) return;
            shareNavigated = true;
            web.loadUrl(Core.baseUrl + "/chat");
            return;
        }
        shareAttempted = true;
        web.evaluateJavascript(shareScript(pendingShare), null);
    }

    /** 页面回话：放进去了就清掉；没放进去（输入框没找到、页面没起来）就复制到剪贴板兜底。 */
    void onSharePlaced(boolean ok) {
        String text = pendingShare;
        if (text == null) return;
        pendingShare = null;
        handler.removeCallbacks(shareTimeout);
        if (ok) {
            toast(getString(R.string.share_placed));
            return;
        }
        android.content.ClipboardManager cm =
                (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (cm != null) {
            cm.setPrimaryClip(android.content.ClipData.newPlainText("Adelie", text));
        }
        toast(getString(R.string.share_copied));
    }

    /**
     * 往页面里塞一段文字的脚本：找页面上面积最大的可见输入框（对话页那个 textarea），
     * 用原生 setter 写进去再发一次 input 事件（React 的受控输入框只认这个），然后回话。
     * 页面刚加载完时输入框可能还没挂上，所以最多重试 15 次（约 3.75 秒）。
     */
    static String shareScript(String text) {
        return "(function(){var want=" + WebDownload.jsLiteral(text) + ";var tries=0;"
                + "function find(){var l=document.querySelectorAll('textarea,[contenteditable=\"true\"]');"
                + "var best=null,area=0;for(var i=0;i<l.length;i++){var e=l[i];"
                + "var r=e.getBoundingClientRect();"
                + "if(r.width<40||r.height<16)continue;var st=window.getComputedStyle(e);"
                + "if(st.visibility==='hidden'||st.display==='none')continue;"
                + "var a=r.width*r.height;if(a>area){area=a;best=e;}}return best;}"
                + "function tryIt(){var el=find();"
                + "if(!el){if(++tries>15){AdelieShell.shared(false);return;}setTimeout(tryIt,250);return;}"
                + "try{el.focus();"
                + "if(el.tagName==='TEXTAREA'){"
                + "var d=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');"
                + "var old=el.value?el.value+'\\n':'';d.set.call(el,old+want);}"
                + "else{el.textContent=want;}"
                + "el.dispatchEvent(new Event('input',{bubbles:true}));"
                + "AdelieShell.shared(true);}catch(e){AdelieShell.shared(false);}}"
                + "tryIt();})()";
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

    /**
     * 首屏那条提醒。侧载包最容易「装上却用不了」的三件事按重要程度排队：无障碍没开（整套手机操控
     * 都是空的）、电池优化会在后台把服务清掉、通知关了就看不到进度与「暂停 / 停止」。
     * 一次只说一件，说完了（用户去开了）自己换下一件 —— 三条一起糊在屏幕顶上没人看。
     *
     * <p>安装未知应用不进这条：它只在更新时才用得上，摆到首屏属于吓人。
     */
    private void setupHintBar() {
        hintBar.setBackground(rounded(R.color.surface_muted));
        hintOpen.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (hintKey == null) return;
                try {
                    startActivity(SetupChecks.intentFor(MainActivity.this, hintKey));
                } catch (Exception e) {
                    toast(getString(R.string.setup_open_failed));
                }
            }
        });
        hintClose.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String key = hintKey;
                if (key == null) return;
                prefs.edit().putString(hintPrefKey(key), versionTag).apply();
                syncHintBar();
            }
        });
    }

    /** 下一件该提醒的事：无障碍 → 电池 → 通知；都好了就没有。 */
    String nextHintKey() {
        if (!SetupChecks.accessibilityOn(this)) return SetupChecks.ACCESSIBILITY;
        if (!SetupChecks.batteryUnrestricted(this)) return SetupChecks.BATTERY;
        if (!SetupChecks.notificationsOn(this)) return SetupChecks.NOTIFICATIONS;
        return null;
    }

    static int hintTextRes(String key) {
        if (SetupChecks.BATTERY.equals(key)) return R.string.hint_battery;
        if (SetupChecks.NOTIFICATIONS.equals(key)) return R.string.hint_notifications;
        return R.string.hint_accessibility;
    }

    /** 每个项目各记各的版本号，关掉「电池」不该把「通知」一起压掉。 */
    static String hintPrefKey(String key) {
        return PREF_HINT_DISMISSED + "." + (key == null ? "" : key);
    }

    /** 这一件事在这个版本里是不是已经被关掉了（顺带把 1.1.2 之前的那个总开关迁过来）。 */
    private boolean hintDismissed(String key) {
        String value = prefs.getString(hintPrefKey(key), "");
        if (value.isEmpty() && SetupChecks.ACCESSIBILITY.equals(key)) {
            // 老版本只有一个总开关，它当时管的正是无障碍这条
            String legacy = prefs.getString(PREF_HINT_LEGACY, "");
            if (!legacy.isEmpty() && legacy.equals(versionTag)) {
                prefs.edit().putString(hintPrefKey(key), legacy).apply();
                return true;
            }
        }
        return versionTag.equals(value);
    }

    /**
     * 只在「有事没办 + 这件本版本还没被关掉 + 没停在设置页 / 回放页」时出现。
     * 设置页上「准备检查」已经把这几件事说清楚了，那里再挂一条就是重复。
     * 服务还没起来（或起失败了）时也让位给顶上那条 banner：同一时刻只说一件事。
     */
    private void syncHintBar() {
        if (hintBar == null) return;
        hintKey = nextHintKey();
        boolean show = hintKey != null
                && Core.ready
                && !settingsShown
                && !journalShown
                && !hintDismissed(hintKey);
        if (show) {
            hintText.setText(getString(hintTextRes(hintKey)));
        }
        hintBar.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    /** 版本号；拿不到就用 unknown（这样「关掉提醒」不会被误当成已关）。 */
    static String versionTag(Context ctx) {
        if (ctx == null) return "unknown";
        try {
            android.content.pm.PackageInfo info = ctx.getPackageManager()
                    .getPackageInfo(ctx.getPackageName(), 0);
            if (info.versionName != null && info.versionName.length() > 0) return info.versionName;
            return String.valueOf(info.versionCode);
        } catch (Exception e) {
            return "unknown";
        }
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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // target=_blank / window.open 在 WebView 里默认是「什么都不发生」：
                // 把新窗口改成当前窗口跳转，下面 shouldOverrideUrlLoading 再把外链交出去
                view.evaluateJavascript(WINDOW_OPEN_PATCH, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view,
                                                    android.webkit.WebResourceRequest request) {
                return handleWebUrl(request == null || request.getUrl() == null
                        ? null : request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleWebUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                if (url != null && url.contains("/api/auth/claim")) {
                    // 首登链接是一次性的，用过就作废：否则换主题/转屏重建页面时会再走一遍必败的链接
                    Core.claimUrl = null;
                }
                // 版本改写先跑、样式兜底后跑：后者是既有的「最后一次注入」断言，别把它挤掉
                injectVersionTag(view);
                injectMobileFix(view);
                syncTabFromUrl();
                // 有分享进来的文字就趁这一屏把它塞进对话输入框
                flushShare(url);
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

        // 网页里内存里生成的文件（blob:）只能由页面自己读出来、经这座桥交回来
        web.addJavascriptInterface(new PageBridge(), "AdelieShell");

        // 网页里的下载链接：WebView 自己不认，不给监听点了就是没反应
        web.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                startWebDownload(url, userAgent, contentDisposition, mimeType, contentLength);
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

            @Override
            public boolean onShowFileChooser(WebView view,
                                             android.webkit.ValueCallback<android.net.Uri[]> callback,
                                             FileChooserParams params) {
                return openFileChooser(callback, params);
            }
        });

        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true);   // adb forward 后 chrome://inspect
        }
    }

    /**
     * 网页里点「上传图片 / 选附件」时把系统的文件选择器叫出来。
     *
     * <p>WebView 不接这个回调的话，&lt;input type="file"&gt; 点了就是毫无反应 ——
     * 聊天里发图、给 Agent 加附件都卡在这一步。accept 里可能有多种类型（image/*,video/*），
     * 这时用 EXTRA_MIME_TYPES 传，别拼成逗号串塞进 setType（那是不合法的）。
     */
    private boolean openFileChooser(android.webkit.ValueCallback<android.net.Uri[]> callback,
                                    WebChromeClient.FileChooserParams params) {
        if (callback == null) return false;
        if (fileCallback != null) {
            // 上一次还没选就又点了一次：先把上游放开，别让它一直等
            fileCallback.onReceiveValue(null);
        }
        fileCallback = callback;
        forgetCapture();

        String[] accept = params == null ? null : params.getAcceptTypes();
        java.util.List<String> types = new java.util.ArrayList<>();
        if (accept != null) {
            for (String type : accept) {
                if (type == null) continue;
                String t = type.trim();
                if (!t.isEmpty() && !types.contains(t)) types.add(t);
            }
        }
        Intent picker = pickerIntent(types,
                params != null
                        && params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
        Intent intent = picker;
        // <input capture>：网页要什么就给什么入口 —— 图片给「拍照」，视频给「录像」，
        // 两种都收就两个都给。拍/录完直接把这个文件交回网页，不用先去相册里找。
        if (params != null && params.isCaptureEnabled()) {
            boolean image = wantsImage(types);
            boolean video = wantsVideo(types);
            java.util.List<Intent> cameras = new java.util.ArrayList<>();
            // 精简系统里可能整台机器没有相机应用：那就只给「从文件里选」，并且说一声，
            // 别让人以为是点了没反应。
            boolean cameraMissing = false;
            if (image) {
                if (canHandle(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)) {
                    Intent photo = newCameraIntent();
                    if (photo != null) cameras.add(photo);
                    else cameraMissing = true;
                } else {
                    cameraMissing = true;
                }
            }
            if (video) {
                if (canHandle(android.provider.MediaStore.ACTION_VIDEO_CAPTURE)) {
                    Intent clip = newVideoIntent();
                    if (clip != null) cameras.add(clip);
                    else cameraMissing = true;
                } else {
                    cameraMissing = true;
                }
            }
            if (cameraMissing && cameras.isEmpty()) {
                toast(getString(R.string.file_chooser_no_camera));
            }
            if (!cameras.isEmpty()) {
                int title = !image ? R.string.file_chooser_record_title
                        : (video ? R.string.file_chooser_capture_video_title
                        : R.string.file_chooser_capture_title);
                intent = Intent.createChooser(picker, getString(title));
                intent.putExtra(Intent.EXTRA_INITIAL_INTENTS,
                        cameras.toArray(new Intent[0]));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            }
        }
        try {
            startActivityForResult(intent, REQ_FILE_CHOOSER);
            return true;
        } catch (Exception e) {
            // 有的精简系统把 DocumentsUI / 相机都删了；如实告诉用户，网页那边也得松开
            fileCallback = null;
            forgetCapture();
            callback.onReceiveValue(null);
            toast("这台机器没有文件选择器");
            return false;
        }
    }

    /** accept 为空、`image/*`、或者具体某种 image/jpeg，都算「要图片」。 */
    static boolean wantsImage(java.util.List<String> types) {
        if (types == null || types.isEmpty()) return true;
        for (int i = 0; i < types.size(); i++) {
            String t = types.get(i);
            if (t == null) continue;
            String v = t.trim().toLowerCase(java.util.Locale.US);
            if (v.equals("*/*") || v.startsWith("image/")) return true;
        }
        return false;
    }

    /**
     * 网页是不是在要视频。空的 accept 当作「要图片」（和 {@link #wantsImage} 的老行为一致），
     * 所以这里空列表一律 false —— 不认识的输入不该冒出个录像入口。
     */
    static boolean wantsVideo(java.util.List<String> types) {
        if (types == null || types.isEmpty()) return false;
        for (int i = 0; i < types.size(); i++) {
            String t = types.get(i);
            if (t == null) continue;
            String v = t.trim().toLowerCase(java.util.Locale.US);
            if (v.equals("*/*") || v.startsWith("video/")) return true;
        }
        return false;
    }

    private Intent pickerIntent(java.util.List<String> types, boolean multiple) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if (types.size() == 1) {
            intent.setType(types.get(0));
        } else {
            intent.setType("*/*");
            if (!types.isEmpty()) {
                intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            }
        }
        if (multiple) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        return intent;
    }

    /**
     * 相机的输出地址：先在 cache/photos 下开一个空文件，再把这个 FileProvider 地址交出去。
     * 相机 App 会往这个文件里写，我们不用给它存储权限（Android 7 起 file:// 也递不出去）。
     */
    private Intent newCameraIntent() {
        try {
            File dir = new File(getCacheDir(), "photos");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            // 精确到毫秒：同一秒里连拍两张也不会互相覆盖（网页那边可能还引用着上一张）
            File file = new File(dir, "shot-"
                    + new java.text.SimpleDateFormat("yyyyMMdd-HHmmssSSS", java.util.Locale.US)
                    .format(new java.util.Date()) + ".jpg");
            captureFile = file;
            captureUri = androidx.core.content.FileProvider.getUriForFile(
                    this, getPackageName() + ".files", file);
            Intent camera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, captureUri);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            camera.setClipData(ClipData.newRawUri("adelie-shot", captureUri));
            return camera;
        } catch (Exception e) {
            forgetCapture();
            return null;
        }
    }

    /** 这台机器上有没有应用接得住这个动作（有没有相机 / 录像应用）。 */
    private boolean canHandle(String action) {
        try {
            return !getPackageManager()
                    .queryIntentActivities(new Intent(action), 0).isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 录像的输出地址，和拍照那套一样：先在 cache/videos 里开个空文件，再把 FileProvider
     * 地址交给相机。`ACTION_VIDEO_CAPTURE` 从 API 18 起就认 EXTRA_OUTPUT，录完写进这个文件，
     * 回给我们的 data 是空的 —— 别指望它给缩略图。
     */
    private Intent newVideoIntent() {
        try {
            File dir = new File(getCacheDir(), "videos");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            File file = new File(dir, "clip-"
                    + new java.text.SimpleDateFormat("yyyyMMdd-HHmmssSSS", java.util.Locale.US)
                    .format(new java.util.Date()) + ".mp4");
            captureFile = file;
            captureUri = androidx.core.content.FileProvider.getUriForFile(
                    this, getPackageName() + ".files", file);
            Intent camera = new Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE);
            camera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, captureUri);
            // 给 Agent 看的一段录像不需要长片：30 秒、48 MB 封顶，别让一次误操作录出一部电影
            // 把手机撑满、传到网页那边也没人看得完。相机应用可以不认这两个附加值，认了就在那儿停。
            camera.putExtra(android.provider.MediaStore.EXTRA_VIDEO_QUALITY, 1);
            camera.putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT, VIDEO_MAX_SECONDS);
            camera.putExtra(android.provider.MediaStore.EXTRA_SIZE_LIMIT, VIDEO_MAX_BYTES);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            camera.setClipData(ClipData.newRawUri("adelie-clip", captureUri));
            return camera;
        } catch (Exception e) {
            forgetCapture();
            return null;
        }
    }

    /** 忘掉这一次的拍照 / 录像输出（选了文件、取消了、或者根本没用相机）。 */
    private void forgetCapture() {
        captureUri = null;
        captureFile = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            android.webkit.ValueCallback<android.net.Uri[]> callback = fileCallback;
            fileCallback = null;
            android.net.Uri shot = captureUri;
            File shotFile = captureFile;
            forgetCapture();
            if (callback != null) {
                android.net.Uri[] uris = null;
                if (resultCode == RESULT_OK) {
                    // 相机拍了照：它只往 EXTRA_OUTPUT 那个文件里写，回给我们的 data 是空的
                    if (shot != null && shotFile != null && shotFile.length() > 0
                            && (data == null || data.getData() == null)) {
                        uris = new android.net.Uri[]{shot};
                    } else {
                        // 选了文件，或者相机没写东西（个别 ROM 忽略 EXTRA_OUTPUT）
                        uris = parseChosen(data);
                    }
                }
                callback.onReceiveValue(uris);   // 取消就给 null，网页自己会当作没选
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /**
     * 从选择器回来的结果里挑出选中的 Uri：多选走 ClipData，单选走 data。
     * 不用 `FileChooserParams.parseResult` —— 它要经由 WebView 的内部实现，自己解更稳。
     */
    static android.net.Uri[] parseChosen(Intent data) {
        if (data == null) return null;
        java.util.List<android.net.Uri> out = new java.util.ArrayList<>();
        android.content.ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                android.net.Uri uri = clip.getItemAt(i) == null ? null : clip.getItemAt(i).getUri();
                if (uri != null && !out.contains(uri)) out.add(uri);
            }
        }
        android.net.Uri single = data.getData();
        if (out.isEmpty() && single != null) out.add(single);
        return out.isEmpty() ? null : out.toArray(new android.net.Uri[0]);
    }

    /**
     * 网页端的弹层（设置、用户菜单、模型选择）在手机高度下原本滑不动：
     * 内容列是 flex-1 但没写 min-height:0，内层的 overflow-y:auto 就被撑高、永远不滚。
     * 这里补一条兜底样式 —— 只动手机外壳，不碰网页产物，网页端自己修了也不冲突。
     */
    private static final String MOBILE_FIX_CSS =
            "[class*=\"ui-scrim\"] [class*=\"flex-1\"][class*=\"flex-col\"]{min-height:0!important;}"
                    + "[class*=\"ui-scrim\"] [class*=\"overflow-y-auto\"]{-webkit-overflow-scrolling:touch;}"
                    + "[class*=\"ui-scrim\"]{overscroll-behavior:contain;}";

    /** window.open 的兜底：改成当前页跳转（外链再由 shouldOverrideUrlLoading 交出去）。 */
    private static final String WINDOW_OPEN_PATCH =
            "(function(){if(window.__adelieOpenPatched)return;window.__adelieOpenPatched=true;"
                    + "var o=window.open;window.open=function(u){if(u){try{location.href=u;}catch(e){}"
                    + "return null;}return o?o.apply(window,arguments):null;};})()";

    /** 这个地址是不是 Adelie 自己那一份页面（自己的页面留在 WebView 里，别踢到浏览器）。 */
    static boolean isOwnUrl(String url, String base) {
        if (url == null || url.isEmpty()) return true;
        String u = url.trim();
        if (u.startsWith("about:") || u.startsWith("javascript:") || u.startsWith("data:")
                || u.startsWith("blob:")) {
            return true;
        }
        if (base == null || base.isEmpty()) return false;
        try {
            String host = android.net.Uri.parse(u).getHost();
            String own = android.net.Uri.parse(base).getHost();
            return host != null && host.equals(own);
        } catch (Exception e) {
            return false;
        }
    }

    /** 网页里点了别的站点 / mailto / tel / 自家 App 的 scheme：交给系统去开。 */
    boolean handleWebUrl(String url) {
        if (isOwnUrl(url, Core.baseUrl)) return false;
        openOutside(url);
        return true;
    }

    /** 用系统打开一个链接；没有 App 接得住就说一句，别让页面停在原地。 */
    void openOutside(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            toast(getString(R.string.web_link_no_app));
        }
    }

    /**
     * 网页里的下载：带着 WebView 的 cookie 自己下一份，落在 cache/share 里，
     * 下完交给系统分享面板（发微信、存网盘都行）。下载大小有上限，临时文件在
     * 设置 → 关于 →「临时文件」里看得见、清得掉。
     */
    void startWebDownload(final String url, final String userAgent,
                          final String contentDisposition, final String mimeType,
                          final long contentLength) {
        if (url != null && url.startsWith("blob:")) {
            startBlobDownload(url, contentDisposition, mimeType);
            return;
        }
        if (url != null && url.startsWith("data:")) {
            startDataDownload(url, contentDisposition, mimeType);
            return;
        }
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            toast(getString(R.string.web_download_failed));
            return;
        }
        if (contentLength > WebDownload.MAX_BYTES) {
            toast(getString(R.string.web_download_too_big));
            return;
        }
        toast(getString(R.string.web_download_starting));
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String cookie = android.webkit.CookieManager.getInstance().getCookie(url);
                    File dir = new File(getCacheDir(), CacheClean.DIR_SHARE);
                    String name = WebDownload.fileName(url, contentDisposition, mimeType);
                    final File file = WebDownload.fetch(url, cookie, userAgent, dir, name,
                            WebDownload.MAX_BYTES);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            shareDownload(file, mimeType);
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            toast(getString(R.string.web_download_failed));
                        }
                    });
                }
            }
        }, "adelie-download").start();
    }

    /**
     * `blob:` 下载：那个地址只在网页进程里有效，外壳这边取不到 —— 让页面自己 fetch 读成 base64，
     * 再从 JS 桥递回来。脚本见 {@link WebDownload#blobScript}。
     */
    void startBlobDownload(String url, String contentDisposition, String mimeType) {
        String name = WebDownload.fileName("", contentDisposition,
                mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType);
        toast(getString(R.string.web_download_starting));
        web.evaluateJavascript(WebDownload.blobScript(url, name, mimeType), null);
    }

    /**
     * `data:` 下载：内容就在地址里，直接解出来存盘。网页里生成小文件（截图、CSV）常用这种。
     */
    void startDataDownload(String url, String contentDisposition, String mimeType) {
        int comma = url == null ? -1 : url.indexOf(',');
        if (comma < 0) {
            toast(getString(R.string.web_download_failed));
            return;
        }
        String meta = url.substring("data:".length(), comma);
        String mime = meta.isEmpty() ? mimeType : meta.split(";")[0];
        boolean base64 = meta.endsWith(";base64");
        String payload = url.substring(comma + 1);
        String name = WebDownload.fileName("", contentDisposition,
                mime == null || mime.isEmpty() ? "text/plain" : mime);
        try {
            File dir = new File(getCacheDir(), CacheClean.DIR_SHARE);
            File file;
            if (base64) {
                file = WebDownload.saveBase64(payload, dir, name, WebDownload.MAX_BYTES);
            } else {
                String text = android.net.Uri.decode(payload);
                file = WebDownload.save(text.getBytes("UTF-8"), dir, name, WebDownload.MAX_BYTES);
            }
            shareDownload(file, mime);
        } catch (Exception e) {
            toast(getString(R.string.web_download_failed));
        }
    }

    /**
     * 网页递东西回来的那座桥：名字固定是 `AdelieShell`（见 {@link WebDownload#blobScript}）。
     * 只做一件事 —— 收一段 base64 落成文件再交给分享面板；别的什么都不暴露。
     */
    final class PageBridge {
        @android.webkit.JavascriptInterface
        public void download(final String name, final String mime, final String base64,
                             final double size) {
            if (base64 == null || base64.isEmpty()) {
                downloadFailed();
                return;
            }
            if (size > WebDownload.MAX_BYTES) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.web_download_too_big));
                    }
                });
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        final File file = saveBlobFile(name, mime, base64, size);
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                shareDownload(file, mime);
                            }
                        });
                    } catch (Exception e) {
                        downloadFailed();
                    }
                }
            }, "adelie-blob").start();
        }

        @android.webkit.JavascriptInterface
        public void downloadFailed() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    toast(getString(R.string.web_download_failed));
                }
            });
        }

        /** 分享进来的文字有没有塞进输入框：塞进去了说一声，没塞进就复制兜底。 */
        @android.webkit.JavascriptInterface
        public void shared(final boolean placed) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    onSharePlaced(placed);
                }
            });
        }
    }

    /**
     * 网页递回来的 base64 落盘（JS 桥与单测都走这里）。写进 cache/share，
     * 计入「临时文件」，不会跑到别的地方去。
     */
    File saveBlobFile(String name, String mime, String base64, double size) throws Exception {
        if (size > WebDownload.MAX_BYTES) throw new java.io.IOException("文件太大");
        File dir = new File(getCacheDir(), CacheClean.DIR_SHARE);
        return WebDownload.saveBase64(base64, dir, name, WebDownload.MAX_BYTES);
    }

    /** 把下回来的文件交给系统分享面板；类型按服务端给的 MIME 走。 */
    void shareDownload(File file, String mime) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime == null || mime.isEmpty() ? "*/*" : mime);
            send.putExtra(Intent.EXTRA_STREAM, JournalExport.uri(this, file));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, getString(R.string.web_download_chooser)));
        } catch (Exception e) {
            toast(getString(R.string.web_download_failed));
        }
    }

    private void injectMobileFix(WebView view) {
        String js = "(function(){var id='adelie-mobile-fix';var s=document.getElementById(id);"
                + "if(!s){s=document.createElement('style');s.id=id;"
                + "(document.head||document.documentElement).appendChild(s);}"
                + "s.textContent=" + jsString(MOBILE_FIX_CSS) + ";return 1;})()";
        view.evaluateJavascript(js, null);
    }

    /**
     * 首页底部那行版本显示的是 Adelie 本体（包内是 v0.6.11）外加桌面版的更新检查，
     * 在手机上既不是这个安卓包的版本，还会劝人升到 v0.8.7。这里改写成安卓包的版本，
     * 顺便抹掉那条更新提示 —— 安卓包只在 设置 → 关于 里按自己的清单检查更新。
     *
     * <p>前端是 SPA，重新渲染会把这行写回去，所以挂一个 MutationObserver 盯着。
     */
    void injectVersionTag(WebView view) {
        String js = "(function(){"
                + "var want=" + jsString(webVersionText(this)) + ";"
                + "var re=/^v\\d+\\.\\d+\\.\\d+/;"
                + "var pure=/^v\\d+\\.\\d+\\.\\d+[-+.\\w]*$/;"
                + "function fix(){var ps=document.querySelectorAll('p'),n=0;"
                + "for(var i=0;i<ps.length;i++){var p=ps[i],t=(p.textContent||'').trim();"
                + "if(!re.test(t)||t===want)continue;"
                + "var line=t.indexOf('最近更新日期')>=0||t.indexOf('最新版本')>=0"
                + "||t.indexOf('有新版本可用')>=0;"
                + "var bare=pure.test(t)&&(''+p.className).indexOf('text-gray-400')>=0;"
                + "if(!line&&!bare)continue;"
                + "p.textContent=want;n++;}return n;}"
                + "fix();"
                + "if(!window.__adelieVerTag){window.__adelieVerTag=new MutationObserver(function(){fix();});"
                + "window.__adelieVerTag.observe(document.body,{childList:true,subtree:true,characterData:true});}"
                + "return 1;})()";
        view.evaluateJavascript(js, null);
    }

    private static String jsString(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 8);
        sb.append('\'');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' || c == '\'') sb.append('\\').append(c);
            else if (c == '\n') sb.append("\\n");
            else if (c == '\r') sb.append("\\r");
            else sb.append(c);
        }
        return sb.append('\'').toString();
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
        if (journalShown) {
            journalShown = false;
            journalPage.setVisibility(View.GONE);
        }
        if (index == TAB_SETTINGS) {
            settingsShown = true;
            showLog(false);
            web.setVisibility(View.GONE);
            pageProgress.setVisibility(View.INVISIBLE);
            buildSettingsBody();
            settingsPage.setVisibility(View.VISIBLE);
            tab = TAB_SETTINGS;
            syncNav(TAB_SETTINGS);
            syncHintBar();
            return;
        }

        settingsShown = false;
        settingsPage.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        syncHintBar();

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
        if (settingsShown || journalShown || web == null) return;
        String url = web.getUrl();
        // 还停在 about:blank（服务没起来 / 第一页没加载）时别动底部：否则会被当成
        // 「不在任何 tab 上」，把「对话」的选中状态清掉，导航就停在错的那一项上。
        if (url == null || url.isEmpty() || url.startsWith("about:")) return;
        String path = pathOf(url);
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
        journalShown = false;
        journalPage.setVisibility(View.GONE);
        settingsShown = false;
        settingsPage.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        syncHintBar();
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
        boolean failed = Core.failed();
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
        boolean failed = Core.failed();
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
        settingsSubtitle.setText(getString(R.string.app_name) + " · " + versionLabel(this));

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

        // 侧载包要先过几道系统开关；只摆挡住用的事，全就绪时这块整个不出现
        List<SetupChecks.Item> todo = SetupChecks.pending(this, SetupChecks.REAL);
        if (!todo.isEmpty()) {
            settingsBody.addView(sectionHeader(getString(R.string.section_setup)));
            LinearLayout setup = card();
            for (int i = 0; i < todo.size(); i++) {
                if (i > 0) setup.addView(divider());
                setup.addView(setupRow(todo.get(i)));
            }
            settingsBody.addView(wrapCard(setup));
        }

        settingsBody.addView(sectionHeader(getString(R.string.section_control)));
        LinearLayout control = card();
        View controlRow = inflateRow(getString(R.string.row_control),
                getString(R.string.row_control_desc), true);
        TextView controlValue = controlRow.findViewById(R.id.row_value);
        controlValue.setText(getString(PhoneControl.ready()
                ? R.string.row_control_on : R.string.row_control_off));
        controlValue.setTextColor(getColor(PhoneControl.ready()
                ? R.color.accent : R.color.ink_muted));
        controlValue.setVisibility(View.VISIBLE);
        controlRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                    toast("在系统无障碍里打开「Adelie 手机操控」");
                } catch (Exception e) {
                    toast("这台机器打不开无障碍设置");
                }
            }
        });
        control.addView(controlRow);
        control.addView(divider());

        View backstageRow = inflateRow(getString(R.string.row_control_backstage),
                getString(R.string.row_control_backstage_desc), false);
        TextView backstageValue = backstageRow.findViewById(R.id.row_value);
        backstageValue.setText(getString(Projection.active()
                ? R.string.row_control_backstage_on : R.string.row_control_backstage_off));
        backstageValue.setTextColor(getColor(Projection.active()
                ? R.color.accent : R.color.ink_muted));
        backstageValue.setVisibility(View.VISIBLE);
        backstageRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Projection.active()) {
                    Projection.stop();
                    buildSettingsBody();
                    toast("后台屏已关");
                } else {
                    Projection.requestConsent(MainActivity.this);
                    toast("系统会问「开始录制或投屏」，点允许");
                }
            }
        });
        control.addView(backstageRow);
        control.addView(divider());

        View backstageCheck = inflateRow(getString(R.string.row_control_backstage_check),
                getString(R.string.row_control_backstage_check_desc), false);
        backstageCheck.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                projectionSelfCheck();
            }
        });
        control.addView(backstageCheck);
        control.addView(divider());

        final int allowedCount = PhoneControl.allowedPackages().length;
        View appsRow = inflateRow(getString(R.string.row_control_apps),
                getString(R.string.row_control_apps_desc), false);
        TextView appsValue = appsRow.findViewById(R.id.row_value);
        appsValue.setText(allowedCount == 0
                ? getString(R.string.row_control_apps_all)
                : allowedCount + " 个");
        appsValue.setTextColor(getColor(allowedCount == 0 ? R.color.ink_muted : R.color.accent));
        appsValue.setVisibility(View.VISIBLE);
        appsRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pickAllowedApps();
            }
        });
        control.addView(appsRow);
        control.addView(divider());

        final int trustedCount = PhoneControl.trustedCount();
        View trustedRow = inflateRow(getString(R.string.row_control_trusted),
                getString(R.string.row_control_trusted_desc), false);
        TextView trustedValue = trustedRow.findViewById(R.id.row_value);
        trustedValue.setText(trustedCount == 0
                ? getString(R.string.row_control_trusted_none)
                : getString(R.string.row_control_trusted_count, trustedCount));
        trustedValue.setTextColor(getColor(trustedCount == 0 ? R.color.ink_muted : R.color.accent));
        trustedValue.setVisibility(View.VISIBLE);
        trustedRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmClearTrusted();
            }
        });
        control.addView(trustedRow);
        control.addView(divider());

        View confirmRow = inflateRow(getString(R.string.row_control_confirm),
                getString(R.string.row_control_confirm_desc), false);
        TextView confirmValue = confirmRow.findViewById(R.id.row_value);
        confirmValue.setText(getString(PhoneControl.defaultAllowAll()
                ? R.string.row_control_confirm_task : R.string.row_control_confirm_ask));
        confirmValue.setTextColor(getColor(PhoneControl.defaultAllowAll()
                ? R.color.accent : R.color.ink_muted));
        confirmValue.setVisibility(View.VISIBLE);
        confirmRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean allow = !PhoneControl.defaultAllowAll();
                PhoneControl.setDefaultAllowAll(allow);
                prefs.edit().putBoolean(PREF_CONTROL_ALLOW_ALL, allow).apply();
                buildSettingsBody();
                toast(allow ? "之后不再逐步确认" : "每一步都可能问你");
            }
        });
        control.addView(confirmRow);
        control.addView(divider());

        final boolean glowOn = prefs.getBoolean(PREF_CONTROL_GLOW, true);
        View glowRow = inflateRow(getString(R.string.row_control_glow),
                getString(R.string.row_control_glow_desc), false);
        TextView glowValue = glowRow.findViewById(R.id.row_value);
        glowValue.setText(getString(glowOn
                ? R.string.row_control_glow_on : R.string.row_control_glow_off));
        glowValue.setTextColor(getColor(glowOn ? R.color.accent : R.color.ink_muted));
        glowValue.setVisibility(View.VISIBLE);
        glowRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean next = !prefs.getBoolean(PREF_CONTROL_GLOW, true);
                prefs.edit().putBoolean(PREF_CONTROL_GLOW, next).apply();
                PhoneControl.setEdgeGlow(next);
                buildSettingsBody();
            }
        });
        control.addView(glowRow);
        control.addView(divider());

        final int skillCount = PhoneSkill.installed(this);
        View skillRow = inflateRow(getString(R.string.row_control_skill),
                getString(R.string.row_control_skill_desc), false);
        TextView skillValue = skillRow.findViewById(R.id.row_value);
        skillValue.setText(skillCount > 0
                ? getString(R.string.row_control_skill_ok) + " " + skillCount
                : getString(R.string.row_control_skill_wait));
        skillValue.setTextColor(getColor(skillCount > 0 ? R.color.accent : R.color.ink_muted));
        skillValue.setVisibility(View.VISIBLE);
        skillRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        ControlServer.republishPortFile(getApplicationContext());
                        final int n = PhoneSkill.ensure(getApplicationContext());
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                toast(n < 0 ? "Adelie 还没解包完，稍后再试"
                                        : (n == 0 ? "已经是新的了" : "已写入 " + n + " 个 Agent"));
                                buildSettingsBody();
                            }
                        });
                    }
                }, "adelie-skill").start();
            }
        });
        control.addView(skillRow);
        control.addView(divider());

        View readRow = inflateRow(getString(R.string.row_control_read),
                getString(R.string.row_control_read_desc), false);
        readRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                probeScreen();
            }
        });
        control.addView(readRow);
        control.addView(divider());

        drillRow = inflateRow(getString(R.string.row_control_drill),
                getString(R.string.row_control_drill_desc), true);
        final TextView drillValue = drillRow.findViewById(R.id.row_value);
        drillValue.setVisibility(View.VISIBLE);
        drillValue.setText(drillSummary());
        drillValue.setTextColor(getColor(drillOk ? R.color.ink_muted : R.color.danger));
        drillRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                runDrill();
            }
        });
        control.addView(drillRow);
        control.addView(divider());

        final int[] journalStats = PhoneControl.journalStats(this);
        View journalRow = inflateRow(getString(R.string.row_control_journal),
                getString(R.string.row_control_journal_desc), true);
        TextView journalValue = journalRow.findViewById(R.id.row_value);
        journalValue.setText(journalStats[0] == 0
                ? getString(R.string.row_control_journal_empty)
                : (journalStats[1] > 0
                ? getString(R.string.row_control_journal_failed, journalStats[0], journalStats[1])
                : getString(R.string.row_control_journal_count, journalStats[0])));
        journalValue.setTextColor(getColor(journalStats[1] > 0
                ? R.color.danger : R.color.ink_muted));
        journalValue.setVisibility(View.VISIBLE);
        journalRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showJournal(true);
            }
        });
        control.addView(journalRow);
        control.addView(divider());
        control.addView(infoRow(R.string.row_control_api, controlEndpoint(),
                new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        copy(controlEndpointFile());
                    }
                }));
        settingsBody.addView(wrapCard(control));

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
            dev.addView(divider());
            dev.addView(actionRow(R.string.row_diagnostics, R.string.row_diagnostics_desc, 4));
            dev.addView(divider());
            dev.addView(crashRow());
        }
        settingsBody.addView(wrapCard(dev));

        settingsBody.addView(sectionHeader(getString(R.string.section_about)));
        LinearLayout about = card();
        about.addView(infoRow(R.string.row_version, versionLabel(this), null));
        about.addView(divider());
        about.addView(updateRow());
        about.addView(divider());
        about.addView(infoRow(R.string.row_runtime, "Node 24.22.3 · arm64 · small-icu", null));
        about.addView(divider());
        about.addView(infoRow(R.string.row_package, getPackageName(), null));
        about.addView(divider());
        about.addView(cacheRow());
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

    /**
     * 设置 → 关于里的「临时文件」：网页里拍的照片、录的录像、导出的日志占了多少。
     * 这些文件交完就没人管了，安卓只在空间紧张时才会回收 —— 得让人看得见、清得掉。
     */
    private View cacheRow() {
        long bytes = CacheClean.totalBytes(this);
        View row = inflateRow(getString(R.string.row_cache), getString(R.string.row_cache_desc), true);
        TextView value = row.findViewById(R.id.row_value);
        value.setText(bytes > 0 ? CacheClean.human(bytes) : getString(R.string.row_cache_empty));
        value.setVisibility(View.VISIBLE);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showCacheDialog();
            }
        });
        return row;
    }

    /** 临时文件的条目（拍照几张、录像几段、导出的日志几份），点「清理」全删。 */
    private void showCacheDialog() {
        StringBuilder sb = new StringBuilder();
        for (CacheClean.Part part : CacheClean.parts(this)) {
            if (part.files == 0) continue;
            int title;
            if (CacheClean.DIR_PHOTOS.equals(part.dir)) title = R.string.cache_part_photos;
            else if (CacheClean.DIR_VIDEOS.equals(part.dir)) title = R.string.cache_part_videos;
            else title = R.string.cache_part_share;
            if (sb.length() > 0) sb.append('\n');
            sb.append(getString(title, part.files, CacheClean.human(part.bytes)));
        }
        if (sb.length() == 0) {
            toast(getString(R.string.cache_clear_nothing));
            return;
        }
        // 删东西之前把话说明白：删的只是这堆临时文件
        sb.append("\n\n").append(getString(R.string.cache_dialog_note));
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.row_cache))
                .setMessage(sb.toString())
                .setPositiveButton(getString(R.string.cache_clear),
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int which) {
                                long freed = CacheClean.clear(MainActivity.this);
                                buildSettingsBody();
                                toast(getString(R.string.cache_clear_done, CacheClean.human(freed)));
                            }
                        })
                .setNegativeButton(getString(R.string.control_cancel), null)
                .show();
    }

    /** 上次是不是崩过：提示一次（同一个现场只提示一次，别每次开屏都吓人）。 */
    private void notePreviousCrash() {
        long at = CrashLog.time(this);
        if (at <= 0 || prefs.getLong(PREF_CRASH_SEEN, 0L) == at) return;
        prefs.edit().putLong(PREF_CRASH_SEEN, at).apply();
        toast(getString(R.string.crash_last_hint));
    }

    /** 设置 → 开发者「上次异常退出」：右边是那次的时间，点开看全文 / 复制 / 清空。 */
    private View crashRow() {
        long at = CrashLog.time(this);
        View row = inflateRow(getString(R.string.row_crash), getString(R.string.row_crash_desc), false);
        TextView value = row.findViewById(R.id.row_value);
        value.setText(at > 0 ? clock(at) : getString(R.string.crash_none));
        value.setVisibility(View.VISIBLE);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showCrashDialog();
            }
        });
        return row;
    }

    /** 崩溃现场全文：能看、能复制（发给开发者）、能清空。 */
    private void showCrashDialog() {
        final String text = CrashLog.read(this);
        if (text.isEmpty()) {
            toast(getString(R.string.crash_nothing));
            return;
        }
        // 堆栈可能很长：弹层里给个能滚的文本，别把按钮挤出屏幕
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        TextView body = new TextView(this);
        body.setText(text.length() > 8000 ? text.substring(0, 8000) + "\n…" : text);
        body.setTextSize(12);
        body.setTypeface(android.graphics.Typeface.MONOSPACE);
        body.setTextIsSelectable(true);
        int pad = dp(20);
        body.setPadding(pad, dp(8), pad, dp(8));
        scroll.addView(body);
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.crash_dialog_title))
                .setView(scroll)
                .setPositiveButton(getString(R.string.crash_copy),
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int which) {
                                copy(text);
                            }
                        })
                .setNeutralButton(getString(R.string.crash_clear),
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface d, int which) {
                                CrashLog.clear(MainActivity.this);
                                buildSettingsBody();
                                toast(getString(R.string.crash_cleared));
                            }
                        })
                .setNegativeButton(getString(R.string.control_cancel), null)
                .show();
    }

    /** 后台屏自检：授权、虚拟显示、帧数、虚拟显示上的窗口数量、最近一次错误。 */
    private void projectionSelfCheck() {
        String text;
        try {
            org.json.JSONObject st = Projection.status();
            StringBuilder sb = new StringBuilder();
            sb.append(st.optBoolean("active") ? "授权：已开启" : "授权：未开启");
            if (st.optBoolean("active")) {
                sb.append("\n虚拟显示：").append(st.optInt("display"))
                        .append("（").append(st.optString("size", "?")).append("）");
                sb.append("\n帧数：").append(st.optInt("frames"));
                int windows = PhoneControl.virtualWindowCount();
                sb.append("\n虚拟显示上的无障碍窗口：")
                        .append(windows < 0 ? "读不到（无障碍未开或系统低于 11）" : String.valueOf(windows));
                if (!st.optString("lastLaunch").isEmpty()) {
                    sb.append("\n上次启动到后台屏：").append(st.optString("lastLaunch"));
                }
            }
            String error = st.optString("error", "");
            if (!error.isEmpty()) sb.append("\n最近错误：").append(error);
            text = sb.toString();
        } catch (Exception e) {
            text = "自检失败：" + e;
        }
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.row_control_backstage_check))
                .setMessage(text)
                .setPositiveButton("好", null)
                .show();
    }

    /** 选「允许操作的应用」：列出所有可启动的应用，勾谁谁能被操作。 */
    private void pickAllowedApps() {
        toast(getString(R.string.row_control_apps_loading));
        new Thread(new Runnable() {
            @Override
            public void run() {
                final java.util.List<String> labels = new java.util.ArrayList<>();
                final java.util.List<String> packages = new java.util.ArrayList<>();
                android.content.pm.PackageManager pm = getPackageManager();
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_MAIN)
                        .addCategory(android.content.Intent.CATEGORY_LAUNCHER);
                java.util.List<android.content.pm.ResolveInfo> list =
                        pm.queryIntentActivities(intent, 0);
                java.util.Map<String, String> byPackage = new java.util.HashMap<>();
                for (android.content.pm.ResolveInfo ri : list) {
                    String pkg = ri.activityInfo.packageName;
                    if (pkg.equals(getPackageName()) || byPackage.containsKey(pkg)) continue;
                    byPackage.put(pkg, ri.loadLabel(pm).toString());
                }
                java.util.List<String> sorted = new java.util.ArrayList<>(byPackage.keySet());
                java.util.Collections.sort(sorted, new java.util.Comparator<String>() {
                    @Override
                    public int compare(String a, String b) {
                        return byPackage.get(a).compareToIgnoreCase(byPackage.get(b));
                    }
                });
                for (String pkg : sorted) {
                    packages.add(pkg);
                    labels.add(byPackage.get(pkg));
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        showAppPicker(labels, packages);
                    }
                });
            }
        }, "adelie-apps").start();
    }

    /**
     * 勾选「允许操作的应用」。装了几百个应用的手机上，翻列表找「微信」太难 ——
     * 上面一个搜索框（应用名或包名都认），下面勾；筛选只影响看到的那几行，勾过的不会因为搜别丢了。
     * 包内可见：单测直接喂一份假的应用列表。
     */
    void showAppPicker(final java.util.List<String> labels,
                       final java.util.List<String> packages) {
        final java.util.Set<String> checked = new java.util.HashSet<>(
                java.util.Arrays.asList(PhoneControl.allowedPackages()));

        View content = getLayoutInflater().inflate(R.layout.dialog_app_picker, null);
        // 弹窗里的列表得有个高度：占屏幕六成，最多 420dp，小屏上也不顶出键盘。
        // 高度挂在列表那一层上 —— setView 传进来的根会被弹窗强行撑成 MATCH_PARENT，
        // 挂在根上等于白写（列表会一路顶到屏幕底）。
        int height = Math.min(dp(420),
                Math.round(getResources().getDisplayMetrics().heightPixels * 0.6f));
        View box = content.findViewById(R.id.picker_list_box);
        ViewGroup.LayoutParams boxLp = box.getLayoutParams();
        boxLp.height = height;
        box.setLayoutParams(boxLp);

        final com.google.android.material.textfield.TextInputEditText search =
                content.findViewById(R.id.picker_search);
        final android.widget.ListView list = content.findViewById(R.id.picker_list);
        final View empty = content.findViewById(R.id.picker_empty);
        list.setEmptyView(empty);
        final AppPickerAdapter adapter = new AppPickerAdapter(labels, packages, checked);
        list.setAdapter(adapter);

        final androidx.appcompat.app.AlertDialog dialog =
                new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                        .setTitle(getString(R.string.row_control_apps_title))
                        .setView(content)
                        .setPositiveButton(getString(R.string.row_control_apps_save),
                                new android.content.DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(android.content.DialogInterface d, int which) {
                                        saveAllowedApps(checked);
                                    }
                                })
                        .setNeutralButton(getString(R.string.row_control_apps_clear),
                                new android.content.DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(android.content.DialogInterface d, int which) {
                                        saveAllowedApps(new java.util.HashSet<String>());
                                    }
                                })
                        .setNegativeButton(getString(R.string.control_cancel), null)
                        .create();
        if (dialog.getWindow() != null) {
            // 点搜索框弹键盘时，列表跟着缩，不要被键盘盖住
            dialog.getWindow().setSoftInputMode(
                    android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }

        // 勾一个，「保存」上那个数字就跳一下：不用翻回列表数自己勾了几个
        list.setOnItemClickListener(new android.widget.AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(android.widget.AdapterView<?> parent, View view,
                                    int position, long id) {
                String pkg = adapter.packageAt(position);
                if (!checked.add(pkg)) checked.remove(pkg);
                adapter.notifyDataSetChanged();
                updateAppPickerSave(dialog, checked.size());
            }
        });
        search.addTextChangedListener(new android.text.TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(android.text.Editable s) {
                adapter.filter(s == null ? "" : s.toString());
                // 换了个词看：回到第一行，别停在上一份列表的位置上看一片空白
                list.setSelection(0);
            }
        });

        dialog.show();
        adapter.filter("");
        updateAppPickerSave(dialog, checked.size());
    }

    /** 「保存」按钮上带着已勾的数量（一个都没勾就只说「保存」）。 */
    private void updateAppPickerSave(androidx.appcompat.app.AlertDialog dialog, int count) {
        if (dialog == null) return;
        android.widget.Button save =
                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE);
        if (save == null) return;
        save.setText(count > 0
                ? getString(R.string.row_control_apps_save_count, count)
                : getString(R.string.row_control_apps_save));
    }

    /**
     * 应用列表的适配器：只有「看到哪几行」是筛过的，勾选状态记在包名集合里，
     * 所以搜一个、勾一个、再搜别的，之前勾的都还在。
     */
    private static final class AppPickerAdapter extends android.widget.BaseAdapter {
        private final java.util.List<String> labels;
        private final java.util.List<String> packages;
        private final java.util.Set<String> checked;
        /** 当前看得到的行：下标指向 labels / packages。 */
        private final java.util.List<Integer> visible = new java.util.ArrayList<>();
        private String query = "";

        AppPickerAdapter(java.util.List<String> labels, java.util.List<String> packages,
                         java.util.Set<String> checked) {
            this.labels = labels;
            this.packages = packages;
            this.checked = checked;
        }

        void filter(String text) {
            query = text == null ? "" : text.trim().toLowerCase(java.util.Locale.ROOT);
            visible.clear();
            for (int i = 0; i < labels.size(); i++) {
                if (query.isEmpty()
                        || labels.get(i).toLowerCase(java.util.Locale.ROOT).contains(query)
                        || packages.get(i).toLowerCase(java.util.Locale.ROOT).contains(query)) {
                    visible.add(i);
                }
            }
            notifyDataSetChanged();
        }

        String packageAt(int position) {
            return packages.get(visible.get(position));
        }

        @Override
        public int getCount() {
            return visible.size();
        }

        @Override
        public Object getItem(int position) {
            return labels.get(visible.get(position));
        }

        @Override
        public long getItemId(int position) {
            return visible.get(position);
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            android.widget.CheckedTextView view = convertView instanceof android.widget.CheckedTextView
                    ? (android.widget.CheckedTextView) convertView
                    : (android.widget.CheckedTextView) android.view.LayoutInflater
                    .from(parent.getContext())
                    .inflate(android.R.layout.simple_list_item_multiple_choice, parent, false);
            int index = visible.get(position);
            view.setText(labels.get(index));
            view.setChecked(checked.contains(packages.get(index)));
            return view;
        }
    }

    private void saveAllowedApps(java.util.Set<String> set) {
        prefs.edit().putStringSet(PREF_CONTROL_APPS, new java.util.HashSet<>(set)).apply();
        PhoneControl.setAllowedPackages(set.toArray(new String[0]));
        buildSettingsBody();
        toast(set.isEmpty() ? "不限制操作范围" : "只允许 " + set.size() + " 个应用");
    }

    /** 「读一下当前屏幕」：只显示读到多少控件、前台是谁，不把内容发出去。 */
    private void probeScreen() {
        if (!PhoneControl.ready()) {
            toast("先去系统无障碍里打开「Adelie 手机操控」");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                org.json.JSONObject req = new org.json.JSONObject();
                org.json.JSONObject out;
                try {
                    req.put("action", "screen");
                } catch (org.json.JSONException ignored) {
                }
                out = PhoneControl.handle(req);
                // 只是自己看一眼，别让浮层为这次读屏挂在那里
                try {
                    PhoneControl.handle(new org.json.JSONObject()
                            .put("action", "task").put("op", "stop"));
                } catch (org.json.JSONException ignored) {
                }
                final String message;
                if (out.optBoolean("ok")) {
                    String fg = out.optString("foreground", "");
                    message = "读到 " + out.optInt("nodes") + " 个控件"
                            + (fg.isEmpty() ? "" : " · " + fg);
                } else {
                    message = out.optString("message", "没读到界面");
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        toast(message);
                    }
                });
            }
        }, "adelie-probe").start();
    }

    /** 设置页那一行右边写什么：没走过就说没走过，走过了就说最后一次的结果。 */
    private String drillSummary() {
        if (prefs.getString(PREF_DRILL, "").isEmpty()) return getString(R.string.row_control_drill);
        return prefs.getBoolean(PREF_DRILL_OK, false)
                ? getString(R.string.row_control_drill_all_ok)
                : getString(R.string.row_control_drill_failed);
    }

    /**
     * 走一遍手机操控的全链路：读屏 → 等稳 → 找控件 → 截图。
     * 真机上出问题没有 adb，用户能做的就是点这一下、把结果复制发过来。
     */
    private void runDrill() {
        toast(getString(R.string.row_control_drill_running));
        new Thread(new Runnable() {
            @Override
            public void run() {
                java.util.List<Drill.Step> steps = Drill.run(new Drill.Runner() {
                    @Override
                    public org.json.JSONObject run(org.json.JSONObject req) {
                        return PhoneControl.handle(req);
                    }
                });
                // 演练只是自己看一眼，别让浮层为它挂在那儿
                try {
                    PhoneControl.handle(new org.json.JSONObject()
                            .put("action", "task").put("op", "stop"));
                } catch (org.json.JSONException ignored) {
                }
                final String report = Drill.report(steps);
                final boolean ok = Drill.allOk(steps);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        drillOk = ok;
                        prefs.edit().putString(PREF_DRILL, report)
                                .putBoolean(PREF_DRILL_OK, ok).apply();
                        if (drillRow != null) {
                            TextView value = drillRow.findViewById(R.id.row_value);
                            value.setText(drillSummary());
                            value.setTextColor(getColor(ok ? R.color.ink_muted : R.color.danger));
                        }
                        showDrillReport(report);
                    }
                });
            }
        }, "adelie-drill").start();
    }

    /** 演练结果：一步一步列出来，能一键复制发人。 */
    void showDrillReport(final String report) {
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.row_control_drill_title))
                .setMessage(report)
                .setPositiveButton("好", null)
                .setNeutralButton(getString(R.string.row_control_drill_copy),
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface dialog, int which) {
                                copy(report);
                                toast(getString(R.string.row_control_drill_copied));
                            }
                        })
                .show();
    }

    /** 本地控制口的地址；Node 那边读 phone-control.json 也能拿到。 */
    private String controlEndpoint() {
        if (!ControlServer.running()) return "未启动";
        return "127.0.0.1:" + ControlServer.port();
    }

    private String controlEndpointFile() {
        File f = ControlServer.portFile();
        if (f == null || !f.exists()) return controlEndpoint();
        FileInputStream in = null;
        try {
            in = new FileInputStream(f);
            byte[] buf = new byte[(int) f.length()];
            int read = in.read(buf);
            return read > 0 ? new String(buf, 0, read, "UTF-8") : controlEndpoint();
        } catch (Exception e) {
            return controlEndpoint();
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) {
                }
            }
        }
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

    private View infoRow(int titleRes, String value, View.OnClickListener click) {        // 短值放右侧（经典设置行）；长值（路径、版本串）放到标题下面，别用省略号截断
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

    /** 「准备」里的一项：标题 + 人话说明，右侧「去开启」，点一下送到系统的那个开关页。 */
    private View setupRow(final SetupChecks.Item item) {
        View row = inflateRow(getString(item.title), getString(item.desc), false);
        TextView value = row.findViewById(R.id.row_value);
        value.setText(getString(R.string.setup_open));
        value.setTextColor(getColor(R.color.accent));
        value.setVisibility(View.VISIBLE);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    startActivity(SetupChecks.intentFor(MainActivity.this, item.key));
                } catch (Exception e) {
                    toast(getString(R.string.setup_open_failed));
                }
            }
        });
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
        } else if (action == 4) {
            exportDiagnostics();
        }
    }

    /**
     * 把诊断包写出来交给分享面板。手机上没有 adb、没法给 logcat，
     * 人点两下就能把「版本 + 准备状态 + 最近的日志」发出来。
     */
    void exportDiagnostics() {
        try {
            String name = Diagnostics.fileName(System.currentTimeMillis());
            File file = Diagnostics.write(this, name);
            android.net.Uri uri = JournalExport.uri(this, file);
            startActivity(Intent.createChooser(Diagnostics.share(uri, name),
                    getString(R.string.diagnostics_chooser)));
        } catch (Exception e) {
            toast(getString(R.string.diagnostics_failed));
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

    // ------------------------------------------------------------------ 检查更新

    /** 设置 → 关于里的那一行：显示上次检查的结果，点一下重新检查。 */
    private View updateRow() {
        View row = inflateRow(getString(R.string.row_update),
                getString(R.string.row_update_desc), false);
        TextView value = row.findViewById(R.id.row_value);
        String seen = prefs.getString(PREF_UPDATE_SEEN, "");
        String current = versionName();
        boolean newer = !seen.isEmpty() && UpdateCheck.compare(seen, current) > 0;
        if (updateChecking) value.setText(R.string.update_checking);
        else if (seen.isEmpty()) value.setText(R.string.update_never);
        else if (newer) value.setText(getString(R.string.update_new, seen));
        else value.setText(R.string.update_latest);
        value.setTextColor(getColor(newer ? R.color.accent : R.color.ink_muted));
        value.setVisibility(View.VISIBLE);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                checkForUpdate(true);
            }
        });
        return row;
    }

    /**
     * 从「更新没成」那条通知点「重新下载」进来：不再弹「发现新版本」对话框，
     * 清单一看有新版本就直接交给下载器。进来后先把 extra 清掉，免得旋屏重建又下一遍。
     */
    void handleLaunchIntent(Intent intent) {
        if (intent == null) return;
        if (wantsOpenJournal(intent)) {
            // onNewIntent 里视图是现成的，但这方法也在 onCreate 最前面被调：先记下来
            intent.removeExtra(EXTRA_OPEN_JOURNAL);
            pendingJournal = true;
        }
        if (!wantsRetryDownload(intent)) return;
        intent.removeExtra(EXTRA_RETRY_UPDATE);
        autoDownloadOnce = true;
        UpdateNotifier.cancel(this);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                checkForUpdate(true);
            }
        }, 400);
    }

    /** 是不是「回来重试更新」的那个意图（单测直接喂）。 */
    static boolean wantsRetryDownload(Intent intent) {
        return intent != null && intent.getBooleanExtra(EXTRA_RETRY_UPDATE, false);
    }

    /** 是不是「看刚才那一轮」的回执（单测直接喂）。 */
    static boolean wantsOpenJournal(Intent intent) {
        return intent != null && intent.getBooleanExtra(EXTRA_OPEN_JOURNAL, false);
    }

    /**
     * 回执点进来：落到回放页，并且直接停在「最近一轮」——用户要看的正是刚才那几步，
     * 不用再从整份日志里自己找。开屏动画让位，别让人对着 logo 等核心起来。
     */
    void applyPendingJournal() {
        if (!pendingJournal) return;
        pendingJournal = false;
        journalLatestOnly = true;
        hideSplash();
        showJournal(true);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent);
        // 应用已经在跑的时候再分享一次：同一个 Activity 接住，直接往输入框里塞
        handleShareIntent(intent);
        applyPendingJournal();
    }

    /**
     * 界面上写的版本号：APK 里的 versionName（`1.3.3-beta` → `1.3.3`）加「内测版」。
     *
     * <p>启动页、设置页副标题、关于页都用它。以前这些地方各自引用一个写死的字符串
     * （`1.1.4 内测版`），发到 1.3.x 还挂着旧号，用户一眼就看见不对。
     */
    static String versionLabel(Context ctx) {
        if (ctx == null) return "";
        String name = versionTag(ctx);
        if (name.endsWith("-beta")) name = name.substring(0, name.length() - 5);
        if ("unknown".equals(name)) return ctx.getString(R.string.version_label_unknown);
        return ctx.getString(R.string.version_label_format, name);
    }

    /** 网页首页那行版本：`v1.3.3 内测版 · 安卓`。 */
    static String webVersionText(Context ctx) {
        String name = versionTag(ctx);
        if (name.endsWith("-beta")) name = name.substring(0, name.length() - 5);
        if ("unknown".equals(name)) name = "";
        String head = name.isEmpty() ? "" : "v" + name + " ";
        return head + ctx.getString(R.string.version_label_suffix)
                + " · " + ctx.getString(R.string.version_web_suffix);
    }

    /** 自己的版本号（不依赖 BuildConfig：AGP 8 默认不生成它）。 */
    String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    /**
     * 去发布站看一眼有没有新版。跑在后台线程；{@code announce} 为 true 时把结果说出来
     * （点进来手动检查），自动检查则安静更新那一行。
     */
    void checkForUpdate(final boolean announce) {
        if (updateChecking) return;
        updateChecking = true;
        final String current = versionName();
        new Thread(new Runnable() {
            @Override
            public void run() {
                String body = null;
                String failure = null;
                try {
                    body = UpdateCheck.fetch(UpdateCheck.INDEX_URL);
                } catch (Exception e) {
                    failure = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                }
                final String payload = body;
                final String error = failure;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        updateChecking = false;
                        if (payload == null) {
                            if (announce) toast(getString(R.string.update_error, error));
                            buildSettingsBody();
                            return;
                        }
                        UpdateCheck.Release release = UpdateCheck.newer(payload, current);
                        prefs.edit()
                                .putLong(PREF_UPDATE_AT, System.currentTimeMillis())
                                .putString(PREF_UPDATE_SEEN,
                                        release == null ? current : release.version)
                                .apply();
                        buildSettingsBody();
                        if (release == null) {
                            autoDownloadOnce = false;
                            if (announce) toast(getString(R.string.update_is_latest));
                        } else if (autoDownloadOnce) {
                            autoDownloadOnce = false;
                            startUpdateDownload(release);
                        } else if (announce) {
                            promptUpdate(release, current);
                        }
                    }
                });
            }
        }, "adelie-update").start();
    }

    /** 有新版本：说清楚从哪到哪、多大，下载交给系统下载器。 */
    void promptUpdate(final UpdateCheck.Release release, String current) {
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.update_dialog_title, release.version))
                .setMessage(getString(R.string.update_dialog_body, current, release.version,
                        UpdateCheck.sizeText(release.size)))
                .setPositiveButton(R.string.update_download,
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface dialog, int which) {
                                startUpdateDownload(release);
                            }
                        })
                .setNeutralButton(R.string.update_copy_url,
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface dialog, int which) {
                                copy(UpdateCheck.resolve(release.url).toString());
                            }
                        })
                .setNegativeButton(R.string.update_later, null)
                .show();
    }

    private void startUpdateDownload(UpdateCheck.Release release) {
        try {
            long id = UpdateCheck.download(this, release);
            // 记住队号：下载完成的通知回来时要认得出是不是我们这一单
            prefs.edit()
                    .putLong(UpdateInstallReceiver.PREF_ID, id)
                    .putString(UpdateInstallReceiver.PREF_FILE, release.file)
                    .putString(UpdateInstallReceiver.PREF_SHA, release.sha256)
                    .apply();
            toast(getString(R.string.update_started));
        } catch (Exception e) {
            toast(getString(R.string.update_download_failed,
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
    }

    // ------------------------------------------------------------------ 任务日志回放

    private void setupJournalPage() {
        journalSearch.addTextChangedListener(new android.text.TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(android.text.Editable s) {
                String q = s == null ? "" : s.toString().trim();
                if (q.equals(journalQuery)) return;
                journalQuery = q;
                if (journalShown) renderJournal();
            }
        });
        journalPage.findViewById(R.id.journal_copy).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copy(joinJournal());
            }
        });
        journalPage.findViewById(R.id.journal_clear).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmClearJournal();
            }
        });
        journalPage.findViewById(R.id.journal_close).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showJournal(false);
            }
        });
        journalPage.findViewById(R.id.journal_export).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                exportJournal();
            }
        });
        journalChipAll.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (journalOnlyFailed || journalLatestOnly || journalTaskFilter != null) {
                    journalOnlyFailed = false;
                    journalLatestOnly = false;
                    journalTaskFilter = null;
                    journalTaskFilterLabel = null;
                    renderJournal();
                }
            }
        });
        journalChipFailed.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!journalOnlyFailed) {
                    journalOnlyFailed = true;
                    renderJournal();
                }
            }
        });
        // 「只看 微信」这颗 chip 是第二维度（不跟另外三个互斥），点它或它后面的 ✕ 都取消
        journalChipApp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                journalFilterByApp(null);
            }
        });
        journalChipApp.setOnCloseIconClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                journalFilterByApp(null);
            }
        });
        // 「最近一轮」和「只看失败」可以叠着用：刚才那一轮里翻车的那几步
        journalChipLatest.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                journalLatestOnly = !journalLatestOnly;
                // 「最近一轮」和点段头选的某一轮是同一维度的两种说法，别叠成空集
                if (journalLatestOnly) {
                    journalTaskFilter = null;
                    journalTaskFilterLabel = null;
                }
                renderJournal();
            }
        });
    }

    /** 打开 / 收起回放页。包内可见：单测直接调用它截图，不用先点进设置。 */
    void showJournal(boolean show) {
        journalShown = show;
        journalPage.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) {
            settingsShown = false;
            settingsPage.setVisibility(View.GONE);
            web.setVisibility(View.GONE);
            pageProgress.setVisibility(View.INVISIBLE);
            // 回放页是设置的下级页，底部就停在「设置」上，不用骗人说在别的 tab
            tab = TAB_SETTINGS;
            syncNav(TAB_SETTINGS);
            journalPage.bringToFront();
            syncHintBar();
            renderJournal();
        } else {
            // 收起来就把筛选清掉：下次进来先看到全部，不会被上次的筛选困住
            journalOnlyFailed = false;
            journalLatestOnly = false;
            journalTaskFilter = null;
            journalTaskFilterLabel = null;
            journalAppFilter = null;
            journalActionFilter = null;
            journalQuery = "";
            if (journalSearch != null) journalSearch.setText("");
            selectTab(TAB_SETTINGS);
        }
    }

    private void renderJournal() {
        if (journalBody == null) return;
        journalBody.removeAllViews();
        List<org.json.JSONObject> all = PhoneControl.journalEntries(this, 200);
        // 动作类型那排 chip 从整份记录里长出来（切到别的动作时它不能跟着少一颗）
        renderActionFilter(all);
        // 按应用、按动作过滤：下面的分段、计数、失败数都只看这些步
        List<org.json.JSONObject> entries = new java.util.ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            org.json.JSONObject one = all.get(i);
            if (journalAppFilter != null
                    && !journalAppFilter.equals(one.optString("foreground", ""))) continue;
            if (journalActionFilter != null
                    && !journalActionFilter.equals(PhoneControl.label(one.optString("action", "")))) {
                continue;
            }
            if (journalTaskFilter != null
                    && one.optLong("task", 0L) != journalTaskFilter.longValue()) {
                continue;
            }
            if (!matchesQuery(one, journalQuery)) continue;
            entries.add(one);
        }
        int failed = 0;
        for (int i = 0; i < entries.size(); i++) {
            if (!entries.get(i).optBoolean("ok")) failed++;
        }
        String filtered = filterLabels();
        String prefix = filtered.isEmpty() ? "" : "只看 " + filtered;
        if (!journalQuery.isEmpty()) {
            String q = getString(R.string.journal_search_label, journalQuery);
            prefix = prefix.isEmpty() ? q : prefix + " · " + q;
        }
        if (!prefix.isEmpty()) {
            journalSubtitle.setText(failed > 0
                    ? getString(R.string.journal_summary_filtered_failed, prefix, entries.size(), failed)
                    : getString(R.string.journal_summary_filtered, prefix, entries.size()));
        } else if (entries.isEmpty()) {
            journalSubtitle.setText(getString(R.string.row_control_journal_count, 0));
        } else if (failed > 0) {
            journalSubtitle.setText(getString(R.string.row_control_journal_failed, entries.size(), failed));
        } else {
            journalSubtitle.setText(getString(R.string.row_control_journal_count, entries.size()));
        }
        // 应用筛选是第二个维度：一行小 chip，点 body 或 ✕ 都能取消
        journalAppRow.setVisibility(journalAppFilter == null ? View.GONE : View.VISIBLE);
        if (journalAppFilter != null) {
            journalChipApp.setText(getString(R.string.journal_filter_app,
                    appLabel(journalAppFilter)));
        }
        journalChipAll.setChecked(!journalOnlyFailed && !journalLatestOnly && journalTaskFilter == null);
        journalChipFailed.setChecked(journalOnlyFailed);
        journalChipLatest.setChecked(journalLatestOnly);

        // 按轮次分段：最新的一轮放最上面，每段一个小标题（哪一轮、几步、失了几步）。
        // 整页倒着走：段从后往前，段内的一步也从后往前 —— 回放时第一眼就是刚才发生了什么。
        List<PhoneControl.Task> groups = PhoneControl.groupTasks(entries);
        int shown = 0;
        int oldest = journalLatestOnly ? Math.max(0, groups.size() - 1) : 0;
        for (int g = groups.size() - 1; g >= oldest; g--) {
            PhoneControl.Task task = groups.get(g);
            List<org.json.JSONObject> visible = new java.util.ArrayList<>();
            for (int i = 0; i < task.items.size(); i++) {
                org.json.JSONObject entry = task.items.get(i);
                if (journalOnlyFailed && entry.optBoolean("ok")) continue;
                visible.add(entry);
            }
            if (visible.isEmpty()) continue;
            if (shown > 0) journalBody.addView(divider());
            journalBody.addView(journalGroupHeader(task, journalTaskFilter != null
                    && task.id == journalTaskFilter.longValue()));
            for (int i = visible.size() - 1; i >= 0; i--) {
                if (i < visible.size() - 1) journalBody.addView(divider());
                journalBody.addView(journalRow(visible.get(i)));
            }
            shown++;
        }
        if (shown == 0) {
            String hint;
            if (entries.isEmpty() && !journalQuery.isEmpty()) hint = getString(R.string.journal_empty_search);
            else if (entries.isEmpty() && journalActionFilter != null) hint = getString(R.string.journal_empty_action);
            else if (entries.isEmpty() && journalAppFilter != null) hint = getString(R.string.journal_empty_app);
            else if (entries.isEmpty()) hint = getString(R.string.journal_empty_hint);
            else if (journalLatestOnly || journalTaskFilter != null) {
                hint = getString(R.string.journal_no_failed_this_run);
            }
            else hint = getString(R.string.journal_no_failed);
            journalBody.addView(journalEmptyView(hint));
        }
        // 换了筛选或搜索词，列表回到顶部：否则停在上一份列表的滚动位置，看到的是空白
        if (journalScroll != null) journalScroll.scrollTo(0, 0);
    }

    /**
     * 一轮任务的小标题。「任务 14:32:05 · 7 步 · 1 次失败」，这一轮出过事的话前面点一个小红点 ——
     * 和每一步左边那个成败圆点是一套语汇，不用整行红字去喊。
     * 老日志没有轮次标记，写「更早的记录」。
     *
     * 段头本身就是个按钮：点一下只剩这一轮（后面写着「只看这一轮」），再点一下放开（写「全部轮次」）。
     * 日志攒了十几轮以后，想复盘「刚才那一轮」不用先去点「最近一轮」再数段头。
     */
    private View journalGroupHeader(final PhoneControl.Task task, boolean active) {
        int failed = task.failed;
        String name;
        if (task.id == 0L || task.first == 0L) {
            name = getString(R.string.journal_task_loose);
        } else {
            name = clock(task.first);
        }
        String span = task.id == 0L || task.first == 0L
                ? name : getString(R.string.journal_task_group, name);
        String text = failed > 0
                ? getString(R.string.journal_task_group_failed, span, task.size(), failed)
                : getString(R.string.journal_task_group_ok, span, task.size());

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(android.view.Gravity.CENTER_VERTICAL);
        head.setPadding(dp(20), dp(14), dp(20), dp(4));
        head.setClickable(true);
        android.util.TypedValue ripple = new android.util.TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackground, ripple, true)) {
            head.setBackgroundResource(ripple.resourceId);
        }

        if (failed > 0) {
            View dot = new View(this);
            GradientDrawable dotBg = new GradientDrawable();
            dotBg.setShape(GradientDrawable.OVAL);
            dotBg.setColor(getColor(R.color.danger));
            dot.setBackground(dotBg);
            LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(6), dp(6));
            dotLp.rightMargin = dp(6);
            head.addView(dot, dotLp);
        }

        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(12);
        label.setTextColor(getColor(R.color.ink_muted));
        head.addView(label, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // 右边那句小字就是这颗按钮的说明：没筛的时候说能点，筛了之后说能放开
        TextView hint = new TextView(this);
        hint.setText(getString(active ? R.string.journal_task_all : R.string.journal_only_this_task));
        hint.setTextSize(12);
        hint.setTextColor(getColor(active ? R.color.ink_muted : R.color.accent));
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintLp.leftMargin = dp(12);
        head.addView(hint, hintLp);

        head.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (journalTaskFilter != null && task.id == journalTaskFilter.longValue()) {
                    journalFilterByTask(null, null);
                } else {
                    journalFilterByTask(task.id,
                            task.id == 0L || task.first == 0L
                                    ? getString(R.string.journal_task_loose) : clock(task.first));
                }
            }
        });
        return head;
    }

    private String clock(long t) {
        return new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
                .format(new java.util.Date(t));
    }

    private View journalEmptyView(String hint) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(android.view.Gravity.CENTER);
        box.setPadding(dp(32), dp(72), dp(32), dp(72));
        TextView title = new TextView(this);
        title.setText(getString(R.string.journal_empty));
        title.setTextSize(16);
        title.setTextColor(getColor(R.color.ink));
        title.setGravity(android.view.Gravity.CENTER);
        box.addView(title);
        TextView desc = new TextView(this);
        desc.setText(hint);
        desc.setTextSize(13);
        desc.setTextColor(getColor(R.color.ink_muted));
        desc.setGravity(android.view.Gravity.CENTER);
        desc.setPadding(0, dp(6), 0, 0);
        box.addView(desc);
        return box;
    }

    /** 一步一条：左边一个成败圆点，中间人话 + 细节，右边是时间。 */
    private View journalRow(final org.json.JSONObject entry) {
        boolean okEntry = entry.optBoolean("ok");
        String action = entry.optString("action", "");
        String step = entry.optString("step", "");
        String foreground = entry.optString("foreground", "");
        String error = entry.optString("error", "");

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(dp(20), dp(12), dp(20), dp(12));
        row.setClickable(true);
        android.util.TypedValue ripple = new android.util.TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackground, ripple, true)) {
            row.setBackgroundResource(ripple.resourceId);
        }

        View dot = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setColor(getColor(okEntry ? R.color.accent : R.color.danger));
        dot.setBackground(dotBg);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(8), dp(8));
        dotLp.topMargin = dp(7);
        dotLp.rightMargin = dp(12);
        row.addView(dot, dotLp);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        row.addView(column, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        String label = PhoneControl.label(action);
        TextView title = new TextView(this);
        title.setText(highlight(step.isEmpty() ? label : step));
        title.setTextSize(15);
        title.setTextColor(getColor(R.color.ink));
        column.addView(title);

        // step 和动作名一样的时候（比如「截图」）别在下面再念一遍
        StringBuilder meta = new StringBuilder(step.equals(label) ? "" : label);
        if (!foreground.isEmpty() && !foreground.equals(getPackageName())) {
            if (meta.length() > 0) meta.append(" · ");
            // 真机上看「微信」比「com.tencent.mm」有用；查不到名字时 appLabel 会退回包名
            meta.append(appLabel(foreground));
        }
        if (meta.length() > 0) {
            TextView metaView = new TextView(this);
            metaView.setText(highlight(meta));
            metaView.setTextSize(12);
            metaView.setTextColor(getColor(R.color.ink_muted));
            metaView.setPadding(0, dp(2), 0, 0);
            column.addView(metaView);
        }
        if (!okEntry) {
            TextView fail = new TextView(this);
            fail.setText(highlight(error.isEmpty() ? "失败" : "失败 · " + error));
            fail.setTextSize(12);
            fail.setTextColor(getColor(R.color.danger));
            fail.setPadding(0, dp(2), 0, 0);
            column.addView(fail);
        }

        TextView time = new TextView(this);
        time.setText(new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
                .format(new java.util.Date(entry.optLong("t"))));
        time.setTextSize(12);
        time.setTextColor(getColor(R.color.ink_muted));
        time.setGravity(android.view.Gravity.TOP | android.view.Gravity.END);
        LinearLayout.LayoutParams timeLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        timeLp.leftMargin = dp(12);
        row.addView(time, timeLp);

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showJournalEntry(entry);
            }
        });
        return row;
    }

    private void showJournalEntry(final org.json.JSONObject entry) {
        String pretty = entry.toString();
        try {
            pretty = entry.toString(2);
        } catch (org.json.JSONException ignored) {
        }
        com.google.android.material.dialog.MaterialAlertDialogBuilder builder =
                new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                        .setTitle(getString(R.string.journal_detail_title))
                        .setMessage(pretty)
                        .setPositiveButton(getString(R.string.journal_detail_copy),
                                new android.content.DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(android.content.DialogInterface dialog, int which) {
                                        copy(entry.toString());
                                    }
                                })
                        .setNegativeButton(getString(R.string.control_cancel), null);
        // 某一步翻车了，多半想知道「这一轮到底在那个应用里干了什么」：从这条直接筛过去。
        // 自己的界面不算（那只是对着 Adelie 说话，没什么可看的）。
        final String app = entry.optString("foreground", "");
        if (!app.isEmpty() && !app.equals(getPackageName())) {
            builder.setNeutralButton(getString(R.string.journal_only_this_app),
                    new android.content.DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(android.content.DialogInterface dialog, int which) {
                            journalFilterByApp(app);
                        }
                    });
        }
        builder.show();
    }

    /** 只看某个应用（传 null 或空串 = 取消）。包内可见：详情弹层与单测都走这里。 */
    void journalFilterByApp(String pkg) {
        journalAppFilter = (pkg == null || pkg.trim().isEmpty()) ? null : pkg.trim();
        renderJournal();
    }

    /**
     * 只看某一轮（task 字段的值，null = 放开）。包内可见：段头和单测都走这里。
     * 和「最近一轮」互斥 —— 选了具体某一轮，「最近一轮」就不该再压着。
     */
    void journalFilterByTask(Long id, String label) {
        journalTaskFilter = id;
        journalTaskFilterLabel = id == null ? null : label;
        if (id != null) journalLatestOnly = false;
        renderJournal();
    }

    /** 只看某一类动作（传人话名，如「点按」；null 或空串 = 取消）。包内可见：单测直接调用。 */
    void journalFilterByAction(String label) {
        journalActionFilter = (label == null || label.trim().isEmpty()) ? null : label.trim();
        renderJournal();
    }

    /**
     * 搜索词按空白切开，每一个都要命中（AND）才算这一步：搜「发送 文件管理」就是
     * 「文件管理器里点发送」的那一步，比一个词更准。每个词可以落在任意一个字段上。
     */
    private boolean matchesQuery(org.json.JSONObject entry, String query) {
        if (query == null || query.isEmpty() || entry == null) return true;
        String foreground = entry.optString("foreground", "");
        String[] fields = {
                entry.optString("step", ""),
                PhoneControl.label(entry.optString("action", "")),
                foreground,
                appLabel(foreground),
                entry.optString("error", ""),
        };
        List<String> tokens = queryTokens(query);
        for (int t = 0; t < tokens.size(); t++) {
            String token = tokens.get(t);
            boolean hit = false;
            for (int i = 0; i < fields.length && !hit; i++) {
                hit = fields[i] != null
                        && fields[i].toLowerCase(java.util.Locale.ROOT).contains(token);
            }
            if (!hit) return false;
        }
        return true;
    }

    /** 搜索词切成小写词元（空白分隔），高亮和匹配用的是同一份切法。 */
    private static List<String> queryTokens(String query) {
        List<String> out = new java.util.ArrayList<>();
        if (query == null || query.isEmpty()) return out;
        String[] parts = query.trim().split("\\s+");
        for (int i = 0; i < parts.length; i++) {
            if (!parts[i].isEmpty()) out.add(parts[i].toLowerCase(java.util.Locale.ROOT));
        }
        return out;
    }

    /**
     * 搜索时把命中的字标出来（强调色 + 加粗），一眼看到词落在哪一行里的哪儿。
     * 步骤名、动作名 · 应用名、失败原因三段都标。
     */
    private CharSequence highlight(CharSequence text) {
        if (text == null || journalQuery.isEmpty()) return text;
        String lower = text.toString().toLowerCase(java.util.Locale.ROOT);
        android.text.SpannableString out = new android.text.SpannableString(text);
        List<String> tokens = queryTokens(journalQuery);
        for (int t = 0; t < tokens.size(); t++) {
            String token = tokens.get(t);
            int from = 0;
            while (true) {
                int at = lower.indexOf(token, from);
                if (at < 0) break;
                out.setSpan(new android.text.style.ForegroundColorSpan(
                                getColor(R.color.accent_on_container)),
                        at, at + token.length(), android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new android.text.style.StyleSpan(android.graphics.Typeface.BOLD),
                        at, at + token.length(), android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                from = at + token.length();
            }
        }
        return out;
    }

    /** 当前挂着的筛选（应用 / 动作），副标题里写成「只看 微信 · 点按」。 */
    private String filterLabels() {
        StringBuilder sb = new StringBuilder();
        if (journalTaskFilter != null && journalTaskFilterLabel != null) {
            sb.append(getString(R.string.journal_filter_task, journalTaskFilterLabel));
        }
        if (journalAppFilter != null) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(appLabel(journalAppFilter));
        }
        if (journalActionFilter != null) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(journalActionFilter);
        }
        return sb.toString();
    }

    /**
     * 顶上一排「只看某个动作」的 chip：日志里出现过哪些动作就给哪几颗，出现次数多的排前面。
     * 只有一类动作时筛选没有意义，整排藏起来；当前筛的那颗是选中态，再点一下取消。
     */
    private void renderActionFilter(List<org.json.JSONObject> all) {
        if (journalActionGroup == null) return;
        // 按人话名归并：协议里 tap / click 是同一个动作的两种写法，不能长成两颗一样的 chip
        java.util.LinkedHashMap<String, Integer> counts = new java.util.LinkedHashMap<>();
        for (int i = 0; i < all.size(); i++) {
            String label = PhoneControl.label(all.get(i).optString("action", ""));
            if (label.isEmpty()) continue;
            Integer n = counts.get(label);
            counts.put(label, n == null ? 1 : n + 1);
        }
        // 清空日志 / 筛中的那一类被清掉之后，别让页面卡在一个看不见的筛选上
        if (journalActionFilter != null && !counts.containsKey(journalActionFilter)) {
            journalActionFilter = null;
        }
        boolean show = counts.size() > 1;
        journalActionScroll.setVisibility(show ? View.VISIBLE : View.GONE);
        if (!show) return;

        List<String> labels = new java.util.ArrayList<>(counts.keySet());
        java.util.Collections.sort(labels, new java.util.Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                int diff = counts.get(b) - counts.get(a);
                return diff != 0 ? diff : a.compareTo(b);
            }
        });
        journalActionGroup.removeAllViews();
        for (int i = 0; i < labels.size(); i++) {
            final String label = labels.get(i);
            com.google.android.material.chip.Chip chip = (com.google.android.material.chip.Chip)
                    getLayoutInflater().inflate(R.layout.journal_action_chip, journalActionGroup, false);
            chip.setText(label);
            chip.setChecked(label.equals(journalActionFilter));
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    journalFilterByAction(label.equals(journalActionFilter) ? null : label);
                }
            });
            journalActionGroup.addView(chip);
        }
    }

    /** 应用名的显示：能查到用应用自己起的名字，查不到就退回包名，别显示成空白。 */
    String appLabel(String pkg) {
        if (pkg == null || pkg.isEmpty()) return "";
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            android.content.pm.ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            CharSequence label = pm.getApplicationLabel(info);
            if (label != null && label.length() > 0 && !pkg.contentEquals(label)) {
                return label.toString();
            }
        } catch (Exception ignored) {
        }
        return pkg;
    }

    /** 清空「不再追问的应用」：先确认一下，免得手滑把这一层刹车拆了。 */
    private void confirmClearTrusted() {
        if (PhoneControl.trustedCount() == 0) {
            toast(getString(R.string.control_trusted_nothing));
            return;
        }
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.control_trusted_clear_title))
                .setMessage(getString(R.string.control_trusted_clear_body))
                .setPositiveButton(getString(R.string.journal_clear),
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface dialog, int which) {
                                PhoneControl.clearTrusted();
                                buildSettingsBody();
                                toast(getString(R.string.control_trusted_cleared));
                            }
                        })
                .setNegativeButton(getString(R.string.control_cancel), null)
                .show();
    }

    private void confirmClearJournal() {
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(getString(R.string.journal_clear_title))
                .setMessage(getString(R.string.journal_clear_body))
                .setPositiveButton(getString(R.string.journal_clear),
                        new android.content.DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(android.content.DialogInterface dialog, int which) {
                                PhoneControl.clearJournal(MainActivity.this);
                                renderJournal();
                                buildSettingsBody();
                                toast("日志已清空");
                            }
                        })
                .setNegativeButton(getString(R.string.control_cancel), null)
                .show();
    }

    private String joinJournal() {
        return PhoneControl.journalText(PhoneControl.journalEntries(this, 200));
    }

    /**
     * 导出全部记录（最多 2000 条，和设置页的统计同源），交给系统分享面板：
     * 发微信、发邮件、存网盘都行。文件在 cache/share 下，由 FileProvider 临时借出去。
     */
    private void exportJournal() {
        String archive = PhoneControl.journalArchive(this);
        if (archive.trim().isEmpty()) {
            toast(getString(R.string.journal_export_nothing));
            return;
        }
        try {
            String name = JournalExport.fileName(System.currentTimeMillis());
            File file = JournalExport.writeArchive(this, name);
            android.net.Uri uri = JournalExport.uri(this, file);
            startActivity(Intent.createChooser(JournalExport.share(uri, name),
                    getString(R.string.journal_export_chooser)));
        } catch (Exception e) {
            toast(getString(R.string.journal_export_failed));
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
        if (journalShown) {
            // 回放页是从设置里进来的，退回去也是设置
            showJournal(false);
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
    protected void onResume() {
        super.onResume();
        // 从系统无障碍设置回来时，把「已开启 / 未开启」刷新一下
        syncHintBar();
        if (settingsShown) buildSettingsBody();
    }

    @Override
    protected void onDestroy() {
        ControlServer.stop();
        handler.removeCallbacks(tick);
        if (fileCallback != null) {
            // 选文件选到一半就把页面关了：上游还挂着，得放开
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        forgetCapture();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
