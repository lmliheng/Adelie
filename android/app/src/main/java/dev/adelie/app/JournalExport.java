package dev.adelie.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import dev.adelie.app.control.PhoneControl;

/**
 * 把任务日志导成一个文件，交给系统分享面板 —— 微信、邮件、网盘都行。
 *
 * <p>手机上看不来一百条 JSON，可「到底哪一步没成」只有这些记录说得清；
 * 导出来发给自己，比在设置页里翻要快。文件先落在应用私有的 cache/share 下，
 * 再由 FileProvider 给一个临时可读的 content:// 地址 —— Android 7 起不能直接把
 * file:// 递出去，会 FileUriExposedException。
 *
 * <p>内容是 JSONL（一条一行），和磁盘上 `phone-journal.jsonl` 的格式一致。
 */
public final class JournalExport {

    /** 清单里的 provider 用 `${applicationId}.files`，这里跟着包名走，别两处各写一份。 */
    static final String AUTHORITY_SUFFIX = ".files";
    /** 文件落在 cacheDir 下这一层；file_paths.xml 里只放开这一层。 */
    static final String DIR = "share";

    private JournalExport() {
    }

    /** 文件名带分钟级时间戳：连着导出两次不会互相覆盖，也看得出是哪一段的记录。 */
    static String fileName(long now) {
        return "adelie-journal-"
                + new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date(now))
                + ".jsonl";
    }

    /** 写文件；目录建不出来、写不进去都抛 IOException，交给界面上提示。 */
    static File write(Context ctx, List<JSONObject> entries, String name) throws IOException {
        return writeText(ctx, PhoneControl.journalText(entries), name);
    }

    static File writeText(Context ctx, String text, String name) throws IOException {
        File dir = new File(ctx.getCacheDir(), DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("建不出 " + dir);
        File file = new File(dir, name);
        OutputStream out = new FileOutputStream(file, false);
        try {
            out.write((text == null ? "" : text).getBytes("UTF-8"));
            out.flush();
        } finally {
            try {
                out.close();
            } catch (IOException ignored) {
            }
        }
        return file;
    }

    /** 导出界面用：内容就是磁盘上那一整份（含换走的 `.1`），不是回放页那 256 KB 的窗口。 */
    static File writeArchive(Context ctx, String name) throws IOException {
        return writeText(ctx, PhoneControl.journalArchive(ctx), name);
    }

    static String authority(Context ctx) {
        return ctx.getPackageName() + AUTHORITY_SUFFIX;
    }

    static Uri uri(Context ctx, File file) {
        return FileProvider.getUriForFile(ctx, authority(ctx), file);
    }

    /**
     * 分享意图。type 用 application/json：能按扩展名认文件的 App 会当成附件收下；
     * 临时读权限必须显式给，不然收件方打不开我们的私有目录。
     */
    static Intent share(Uri uri, String name) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/json");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, name);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return send;
    }
}
