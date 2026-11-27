package dev.adelie.app;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 上次崩溃的现场。
 *
 * <p>侧载的应用崩了，手机上没有 logcat、没有 adb，用户只能说「它闪退了」—— 开发者一点辙都没有。
 * 这里给未捕获异常装一个兜底：先把时间、版本、线程、堆栈写进 `files/adelie/crash-last.txt`，
 * 再把异常交还给系统原来的处理（该弹「已停止」还弹、该杀进程还杀，行为不变）。
 *
 * <p>下次打开应用时提示一次（同一个文件只提示一次，别每次开屏都吓人），
 * 设置 → 开发者能看到、能复制、能清空，诊断包里也带这一份。
 *
 * <p>只留最后一次：崩溃连发的时候，第一现场通常才是真因，后面多半是它的连锁反应。
 */
final class CrashLog {

    static final String FILE = "crash-last.txt";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static volatile boolean installed;

    private CrashLog() {
    }

    /** 崩溃记录放在数据目录里（和 Adelie 的解包目录同一层），不会被「清缓存」清掉。 */
    static File file(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "adelie");
        if (!dir.isDirectory()) dir.mkdirs();
        return new File(dir, FILE);
    }

    /**
     * 装上兜底处理（只装一次）。原来的处理器会被串在后面 —— 我们只是顺手记一下，不改系统的行为。
     */
    static synchronized void install(Context ctx) {
        if (installed || ctx == null) return;
        installed = true;
        Thread.setDefaultUncaughtExceptionHandler(
                wrap(ctx.getApplicationContext(), Thread.getDefaultUncaughtExceptionHandler()));
    }

    /**
     * 包一层：先记下来，再交给原来的处理器（原处理器是 null 就到此为止）。
     * 拆出来是为了能单测「记了没有」和「有没有接着交给系统」这两件事。
     */
    static Thread.UncaughtExceptionHandler wrap(final Context ctx,
                                                final Thread.UncaughtExceptionHandler chain) {
        return new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable error) {
                write(ctx, thread, error);
                if (chain != null) chain.uncaughtException(thread, error);
            }
        };
    }

    /** 把现场写下来。任何一步出错都咽下去 —— 崩溃处理自己不能崩。 */
    static void write(Context ctx, Thread thread, Throwable error) {
        try {
            StringBuilder sb = new StringBuilder(1024);
            sb.append("时间：").append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
                    .format(new Date())).append('\n');
            sb.append("版本：").append(MainActivity.versionTag(ctx)).append('\n');
            sb.append("线程：").append(thread == null ? "（不知道）" : thread.getName()).append('\n');
            sb.append("异常：").append(error == null ? "（没有异常对象）" : error.toString()).append('\n');
            if (error != null) {
                StringWriter stack = new StringWriter();
                PrintWriter out = new PrintWriter(stack);
                error.printStackTrace(out);
                out.flush();
                sb.append('\n').append(stack);
            }
            OutputStream out = new FileOutputStream(file(ctx), false);
            try {
                out.write(sb.toString().getBytes(UTF8));
                out.flush();
            } finally {
                try {
                    out.close();
                } catch (Exception ignored) {
                }
            }
            Core.note("!!! 未捕获异常，已记录：" + (error == null ? "?" : error.toString()));
        } catch (Throwable ignored) {
            // 记不下来也不能再抛
        }
    }

    /** 上次崩溃的全文；没有就是空串。 */
    static String read(Context ctx) {
        File f = file(ctx);
        if (!f.isFile() || f.length() == 0) return "";
        InputStream in = null;
        try {
            in = new FileInputStream(f);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), UTF8);
        } catch (Exception e) {
            return "";
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    static boolean has(Context ctx) {
        File f = file(ctx);
        return f.isFile() && f.length() > 0;
    }

    /** 崩溃那次的时间（文件的修改时间）；没有就是 0。 */
    static long time(Context ctx) {
        File f = file(ctx);
        return f.isFile() ? f.lastModified() : 0L;
    }

    static void clear(Context ctx) {
        File f = file(ctx);
        if (f.isFile()) f.delete();
    }
}
