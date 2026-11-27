package dev.adelie.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import java.io.InputStream;
import java.security.MessageDigest;

/**
 * 更新包下完：先按清单里的 sha256 验一遍，对得上才把系统安装器叫出来。
 *
 * <p>包是从 HTTP 站上下来的，链路上没有证书兜底，所以这里认的是「和清单里那一串一致」；
 * 对不上就当场删掉，不留一个来源不明的安装包在手机里。
 * 只处理自己排进下载器的那一单 —— 下载器是系统公共的，别人家下的东西不碰。
 */
public class UpdateInstallReceiver extends BroadcastReceiver {

    static final String PREF_ID = "download_id";
    static final String PREF_FILE = "download_file";
    static final String PREF_SHA = "download_sha256";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("adelie", Context.MODE_PRIVATE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null
                || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
            return;
        }
        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
        final Context app = context.getApplicationContext();
        SharedPreferences prefs = prefs(app);
        if (id < 0 || prefs.getLong(PREF_ID, -1L) != id) return;

        DownloadManager dm = (DownloadManager) app.getSystemService(Context.DOWNLOAD_SERVICE);
        Uri downloaded = null;
        if (dm != null) {
            try {
                // 下载失败、被用户删掉，这里都会给 null
                downloaded = dm.getUriForDownloadedFile(id);
            } catch (Exception ignored) {
            }
        }
        if (downloaded == null) {
            // 这一单是我们排的，但文件拿不到：用户取消了，或者下载失败
            forget(prefs);
            UpdateNotifier.downloadFailed(app);
            return;
        }

        final Uri uri = downloaded;
        final long downloadId = id;
        final String expected = prefs.getString(PREF_SHA, "");
        // 100 MB 的包要算一会儿，别在接收器里同步读：goAsync 撑住这段时间
        final PendingResult pending = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                final boolean verified = sha256Matches(app, uri, expected);
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            finish(app, downloadId, uri, verified);
                        } finally {
                            pending.finish();
                        }
                    }
                });
            }
        }, "adelie-update-verify").start();
    }

    /**
     * 验过之后再决定装不装。单独拿出来，单测可以直接喂 verified。
     */
    static void finish(Context context, long id, Uri downloaded, boolean verified) {
        SharedPreferences prefs = prefs(context);
        if (prefs.getLong(PREF_ID, -1L) != id) return;   // 不是我们等的那一单
        if (downloaded == null) return;
        if (!verified) {
            DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                try {
                    dm.remove(id);   // 连文件带通知一起清掉，别让人手滑装上
                } catch (Exception ignored) {
                }
            }
            forget(prefs);
            // 光一个 Toast 人在别的应用里根本看不到，换一条带「重新下载」的通知
            UpdateNotifier.verifyFailed(context);
            Toast.makeText(context, "更新包校验没通过，已经删掉；稍后再试一次",
                    Toast.LENGTH_LONG).show();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            // 还没允许装未知来源：把开关页递到人面前；装完回来点通知里的包即可
            try {
                context.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + context.getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                Toast.makeText(context, "允许「Adelie」安装应用后，再点一下通知栏里的安装包",
                        Toast.LENGTH_LONG).show();
            } catch (Exception ignored) {
            }
            return;
        }
        forget(prefs);
        UpdateNotifier.cancel(context);
        Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(downloaded, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(install);
        } catch (Exception ignored) {
            // 有些 ROM 不认 ACTION_VIEW：退回去让用户点通知栏
        }
    }

    private static void forget(SharedPreferences prefs) {
        prefs.edit().remove(PREF_ID).remove(PREF_FILE).remove(PREF_SHA).apply();
    }

    /** 下回来的包和清单里的 sha256 对不对得上；没给校验值、读不到文件，都算不过。 */
    static boolean sha256Matches(Context context, Uri uri, String expected) {
        if (context == null || uri == null || expected == null) return false;
        String want = expected.trim();
        if (want.isEmpty()) return false;
        String actual = sha256(context, uri);
        return actual != null && actual.equalsIgnoreCase(want);
    }

    static String sha256(Context context, Uri uri) {
        InputStream in = null;
        try {
            in = context.getContentResolver().openInputStream(uri);
            if (in == null) return null;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) {
                }
            }
        }
    }
}
