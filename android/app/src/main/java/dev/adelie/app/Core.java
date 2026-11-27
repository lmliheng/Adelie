package dev.adelie.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Adelie 在安卓上的运行时：把 APK 里的 Node 与 Adelie 自身解开，然后用它跑
 * `penguin server`，把监听端口和前端的登录链接交给界面。
 *
 * 为什么不直接把 node 放进 assets 再 chmod +x：Android 10（targetSdk 29）起应用数据目录
 * 是 noexec 的，execve 会被 SELinux 拒绝。所以 node 以 libnode.so 的身份被打进
 * lib/<abi>/，解包到 nativeLibraryDir（那份目录允许执行），这里只是按那个路径启动它。
 */
final class Core {
    static final String TAG = "Adelie";
    /** payload.zip 的格式版本：变了就重新解一遍（避免旧文件残留）。 */
    private static final String PAYLOAD_VERSION = "1";

    private static final Object LOCK = new Object();
    private static final List<String> LINES = new ArrayList<>();

    static volatile String phase = "未启动";
    static volatile String baseUrl;
    static volatile String claimUrl;
    static volatile boolean ready;
    private static volatile Process proc;
    private static volatile boolean starting;
    /** 用户自己停的（不是事故），意外退出时看它决定要不要拉起。 */
    private static volatile boolean stopping;
    private static volatile Context appCtx;
    private static final Supervisor SUPERVISOR = new Supervisor();
    private static final android.os.Handler MAIN =
            new android.os.Handler(android.os.Looper.getMainLooper());
    private static volatile Runnable pendingRestart;
    /** 单测替换自动拉起的动作；null = 真的重新起进程。 */
    static volatile Runnable restartAction;

    private static final Pattern STARTED =
            Pattern.compile("penguin-server started:\\s*(http://[^\\s:]+:\\d+)");
    private static final Pattern CLAIM =
            Pattern.compile("(http://[^\\s]+/api/auth/claim\\?token=[A-Za-z0-9_%\\-.]+)");

    private Core() {}

    static void start(final Context ctx) {
        synchronized (LOCK) {
            if (starting || ready) return;
            starting = true;
        }
        final Context app = ctx.getApplicationContext();
        appCtx = app;
        stopping = false;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File root = new File(app.getFilesDir(), "adelie");
                    phase = "准备运行文件…";
                    extractIfNeeded(app, root);
                    phase = "启动 Adelie 服务…";
                    launch(app, root);
                    // 进程已经起来了：放开 starting，否则自动拉起会被「正在启动」挡掉
                    synchronized (LOCK) {
                        starting = false;
                    }
                } catch (Throwable t) {
                    phase = "启动失败：" + t;
                    log(t.toString());
                    Log.e(TAG, "start failed", t);
                    synchronized (LOCK) {
                        starting = false;
                    }
                }
            }
        }, "adelie-boot").start();
    }

    static void stop() {
        stopping = true;
        Runnable pending = pendingRestart;
        if (pending != null) {
            MAIN.removeCallbacks(pending);
            pendingRestart = null;
        }
        SUPERVISOR.reset();
        Process p = proc;
        proc = null;
        if (p != null) {
            p.destroy();
            log("已停止服务进程");
        }
        ready = false;
        baseUrl = null;
        claimUrl = null;
        phase = "已停止";
        synchronized (LOCK) {
            starting = false;
        }
    }

    /** 界面用的「出事了」判断：红横幅 + 重试按钮都看它。 */
    static boolean failed() {
        String p = phase == null ? "" : phase;
        return p.startsWith("启动失败") || p.startsWith("服务已退出")
                || p.startsWith("服务意外退出") || p.startsWith("服务反复退出")
                || p.startsWith("正在重启");
    }

    static boolean alive() {
        Process p = proc;
        return p != null && p.isAlive();
    }

    /** 最近的日志行（给界面看；真机排错主要靠这个）。 */
    static List<String> lines() {
        synchronized (LINES) {
            return new ArrayList<>(LINES);
        }
    }

    /** 给崩溃兜底这类「不在 Core 里发生、但该进运行日志」的地方补一行。 */
    static void note(String line) {
        log(line);
    }

    private static void log(String line) {
        Log.i(TAG, line);
        synchronized (LINES) {
            LINES.add(line);
            while (LINES.size() > 600) LINES.remove(0);
        }
    }

    // ---------------------------------------------------------------- 解包

    private static void extractIfNeeded(Context ctx, File root) throws IOException {
        File marker = new File(root, ".payload-version");
        String have = "";
        if (marker.isFile()) {
            try (RandomAccessFile f = new RandomAccessFile(marker, "r")) {
                byte[] b = new byte[(int) Math.min(64, f.length())];
                f.readFully(b);
                have = new String(b, StandardCharsets.UTF_8).trim();
            }
        }
        File cli = new File(root, "lib/dist/penguin.js");
        File web = new File(root, "web/index.html");
        if (PAYLOAD_VERSION.equals(have) && cli.isFile() && web.isFile()) {
            log("运行文件已就绪：" + root);
            return;
        }
        log("解包运行文件到 " + root + " …");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("无法创建 " + root);
        String destPath = root.getCanonicalPath();
        long total = 0;
        byte[] buf = new byte[1 << 16];
        try (InputStream in = new BufferedInputStream(ctx.getAssets().open("payload.zip"), 1 << 16);
             ZipInputStream zin = new ZipInputStream(in)) {
            ZipEntry entry;
            while ((entry = zin.getNextEntry()) != null) {
                File out = new File(root, entry.getName());
                if (!out.getCanonicalPath().startsWith(destPath)) {
                    throw new IOException("可疑的包内路径：" + entry.getName());
                }
                if (entry.isDirectory()) {
                    if (!out.isDirectory() && !out.mkdirs()) throw new IOException("无法创建 " + out);
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                    throw new IOException("无法创建 " + parent);
                }
                try (OutputStream os = new FileOutputStream(out)) {
                    int n;
                    while ((n = zin.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        total += n;
                        if (total % (16L << 20) < buf.length) {
                            phase = "解包中… " + (total >> 20) + " MiB";
                        }
                    }
                }
            }
        }
        try (FileOutputStream os = new FileOutputStream(marker)) {
            os.write(PAYLOAD_VERSION.getBytes(StandardCharsets.UTF_8));
        }
        log("解包完成，共 " + (total >> 20) + " MiB");
    }

    // ---------------------------------------------------------------- 启动

    private static void launch(Context ctx, File root) throws IOException {
        ApplicationInfo ai = ctx.getApplicationInfo();
        String libDir = ai.nativeLibraryDir;
        File node = new File(libDir, "libnode.so");
        if (!node.isFile()) throw new IOException("缺少 libnode.so（" + node + "）");
        File cli = new File(root, "lib/dist/penguin.js");
        if (!cli.isFile()) throw new IOException("缺少 " + cli);

        File home = new File(root, "home");
        File data = new File(root, "data");
        File tmp = new File(root, "tmp");
        File bin = new File(root, "bin");
        for (File d : new File[]{home, data, tmp, bin}) {
            if (!d.isDirectory() && !d.mkdirs()) throw new IOException("无法创建 " + d);
        }

        // Adelie 自己的子进程（Agent 调 `penguin`）会走 shim，不依赖 PATH；但 `env node` 这类
        // 调用仍然要能在 PATH 上找到 node，所以放一个同名小脚本。
        File nodeShim = new File(bin, "node");

        ProcessBuilder pb = new ProcessBuilder(
                node.getAbsolutePath(), cli.getAbsolutePath(), "server",
                "--port", "0", "--host", "127.0.0.1");
        pb.redirectErrorStream(true);
        pb.directory(root);
        java.util.Map<String, String> env = pb.environment();
        env.put("HOME", home.getAbsolutePath());
        env.put("TMPDIR", tmp.getAbsolutePath());
        env.put("PATH", bin.getAbsolutePath() + ":" + libDir + ":/system/bin:/system/xbin");
        env.put("ADELIE_HOME", data.getAbsolutePath());
        env.put("ADELIE_WEB_DIST", new File(root, "web").getAbsolutePath());
        env.put("ADELIE_LANG", "zh-CN");
        env.put("LD_LIBRARY_PATH", libDir);

        log("启动：" + node + " " + cli + " server --port 0 --host 127.0.0.1");
        Process p;
        try {
            p = pb.start();
        } catch (IOException e) {
            // nativeLibraryDir 在某些定制 ROM 上不允许 exec（少见但存在）。退回应用私有目录里
            // 的副本：Android 10 起那条路一般也不行，但 7–9 上可以，至少给出一条活路。
            log("从 nativeLibraryDir 启动失败：" + e + "，改用私有目录里的副本");
            File alt = new File(root, "node-unpacked");
            copyFile(node, alt);
            if (!alt.setExecutable(true, false)) throw new IOException("无法设置执行权限 " + alt);
            env.put("LD_LIBRARY_PATH", libDir + ":" + alt.getParent());
            pb.command(alt.getAbsolutePath(), cli.getAbsolutePath(), "server",
                    "--port", "0", "--host", "127.0.0.1");
            p = pb.start();
            node = alt;
        }
        writeExecutable(nodeShim, "#!/system/bin/sh\n" +
                "export LD_LIBRARY_PATH=\"" + libDir + "\"\n" +
                "exec \"" + node.getAbsolutePath() + "\" \"$@\"\n");
        proc = p;
        readOutput(p);
    }

    private static void copyFile(File from, File to) throws IOException {
        try (java.io.InputStream in = new java.io.FileInputStream(from);
             java.io.OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private static void writeExecutable(File f, String body) throws IOException {
        try (FileOutputStream os = new FileOutputStream(f)) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        if (!f.setReadable(true, false) || !f.setExecutable(true, false)) {
            throw new IOException("无法设置权限 " + f);
        }
    }

    /** 服务端与它的子进程共用这条管道：日志直接进界面，同时从里面认出端口和首登链接。 */
    private static void readOutput(final Process p) {
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                try (java.io.BufferedReader r = new java.io.BufferedReader(
                        new java.io.InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) {
                        log(line);
                        Matcher m = STARTED.matcher(line);
                        if (m.find() && baseUrl == null) {
                            baseUrl = m.group(1);
                            phase = "服务已就绪";
                            ready = true;
                            SUPERVISOR.started(System.currentTimeMillis());
                            log("监听：" + baseUrl);
                        }
                        Matcher c = CLAIM.matcher(line);
                        if (c.find() && claimUrl == null) {
                            claimUrl = c.group(1);
                            log("拿到首登链接");
                        }
                    }
                } catch (IOException e) {
                    log("读取输出结束：" + e);
                }
                int code = -1;
                try {
                    code = p.waitFor();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                if (proc == p) proc = null;
                log("服务进程退出，code=" + code);
                onServiceExit(code);
            }
        }, "adelie-log");
        t.setDaemon(true);
        t.start();
    }

    // ---------------------------------------------------------------- 看门狗

    /**
     * 服务进程退出：用户自己停的就收掉，意外的按 {@link Supervisor} 的退避计划拉起。
     * 界面靠 {@link #phase} 显示「几秒后自动重启」，起来以后照常变回「服务已就绪」。
     */
    static void onServiceExit(int code) {
        ready = false;
        baseUrl = null;
        claimUrl = null;
        long delay = SUPERVISOR.onExit(System.currentTimeMillis(), stopping);
        if (delay == Supervisor.USER_STOPPED) {
            phase = "已停止";
            return;
        }
        if (delay == Supervisor.GIVE_UP) {
            phase = "服务反复退出（code=" + code + "）：看运行日志，或点重试";
            log("放弃自动重启：连续退出 " + SUPERVISOR.failures() + " 次");
            return;
        }
        final int attempt = SUPERVISOR.failures();
        phase = "服务意外退出（code=" + code + "），" + Math.max(1, delay / 1000) + " 秒后自动重启…";
        log("服务意外退出（code=" + code + "），" + delay + "ms 后第 " + attempt + " 次自动拉起");
        Runnable restart = new Runnable() {
            @Override
            public void run() {
                pendingRestart = null;
                if (stopping) return;
                log("自动拉起第 " + attempt + " 次");
                phase = "正在重启 Adelie 服务…";
                Runnable action = restartAction;
                if (action != null) {
                    action.run();
                    return;
                }
                synchronized (LOCK) {
                    starting = false;
                }
                Context ctx = appCtx;
                if (ctx == null) {
                    phase = "服务已退出：没有应用上下文，起不来了";
                    return;
                }
                start(ctx);
            }
        };
        pendingRestart = restart;
        MAIN.postDelayed(restart, delay);
    }

    /** 单测用：把看门狗的状态清干净（不碰真实进程）。 */
    static void resetWatchdogForTest() {
        Runnable pending = pendingRestart;
        if (pending != null) MAIN.removeCallbacks(pending);
        pendingRestart = null;
        stopping = false;
        restartAction = null;
        SUPERVISOR.reset();
        proc = null;
        starting = false;
        ready = false;
        baseUrl = null;
        claimUrl = null;
        phase = "未启动";
    }
}
