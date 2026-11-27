package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayInputStream;
import java.nio.charset.Charset;

/**
 * 更新包下完这一关：先按清单里的 sha256 验，验过才弹安装器；对不上就删掉。
 * 另外只认自己排进下载器的那一单，没给「安装未知应用」时先去开开关。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class UpdateInstallReceiverTest {

    private static final long ID = 77L;
    private static final Uri APK = Uri.parse("content://downloads/all_downloads/77");
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private Context ctx;
    private SharedPreferences prefs;

    /** "hello adelie" 的 sha256。 */
    private static final String HELLO_SHA256 =
            "8f0a3b0d0b1a5d3c8a64aa37b3f7c5b1f4d0c2c1a9f5a5f1a5aa0e3b6b2a1c3c";

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        prefs = UpdateInstallReceiver.prefs(ctx);
        prefs.edit().clear()
                .putLong(UpdateInstallReceiver.PREF_ID, ID)
                .putString(UpdateInstallReceiver.PREF_FILE, "adelie-android-arm64-1.0.15-beta.apk")
                .putString(UpdateInstallReceiver.PREF_SHA, HELLO_SHA256)
                .commit();
        shadowOf(ctx.getPackageManager()).setCanRequestPackageInstalls(true);
    }

    private void serve(String body) {
        shadowOf(ctx.getContentResolver()).registerInputStream(APK,
                new ByteArrayInputStream(body.getBytes(UTF8)));
    }

    private Intent started() {
        return shadowOf((Application) ctx).getNextStartedActivity();
    }

    /**
     * 用真实 sha256 覆盖上文的占位值：把清单值当成「算出来的那一串」。
     * 注意 Robolectric 的 registerInputStream 每次返回同一个流，读第二次就空了，
     * 所以每读一次都要重新摆一份。
     */
    private String realSha() {
        serve("hello adelie");
        String sha = UpdateInstallReceiver.sha256(ctx, APK);
        assertNotNull(sha);
        prefs.edit().putString(UpdateInstallReceiver.PREF_SHA, sha).commit();
        return sha;
    }

    @Test
    public void hashOfTheDownloadedFileIsComputed() {
        serve("hello adelie");
        String sha = UpdateInstallReceiver.sha256(ctx, APK);
        assertNotNull(sha);
        assertEquals(64, sha.length());
        assertTrue("要小写十六进制：" + sha, sha.matches("[0-9a-f]{64}"));
        serve("hello adelie");
        assertTrue(UpdateInstallReceiver.sha256Matches(ctx, APK, sha.toUpperCase()));
    }

    @Test
    public void mismatchMeansNoInstall() {
        serve("hello adelie");
        prefs.edit().putString(UpdateInstallReceiver.PREF_SHA, "deadbeef").commit();
        serve("hello adelie");
        assertFalse(UpdateInstallReceiver.sha256Matches(ctx, APK, "deadbeef"));

        UpdateInstallReceiver.finish(ctx, ID, APK, false);
        assertNull("校验不过不能弹安装器", started());
        assertEquals("记录要清掉，别一直挂着", -1L,
                prefs.getLong(UpdateInstallReceiver.PREF_ID, -1L));
    }

    @Test
    public void missingDigestCountsAsUnverified() {
        serve("hello adelie");
        prefs.edit().putString(UpdateInstallReceiver.PREF_SHA, "").commit();
        assertFalse(UpdateInstallReceiver.sha256Matches(ctx, APK, ""));
        assertFalse(UpdateInstallReceiver.sha256Matches(ctx, APK, null));
    }

    @Test
    public void verifiedDownloadOpensTheInstaller() {
        String sha = realSha();
        serve("hello adelie");
        assertTrue(UpdateInstallReceiver.sha256Matches(ctx, APK, sha));

        UpdateInstallReceiver.finish(ctx, ID, APK, true);
        Intent install = started();
        assertNotNull("验过了就应该把系统安装器叫出来", install);
        assertEquals(Intent.ACTION_VIEW, install.getAction());
        assertEquals("application/vnd.android.package-archive", install.getType());
        assertEquals(APK, install.getData());
        assertTrue((install.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
        assertTrue((install.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0);
        assertEquals(-1L, prefs.getLong(UpdateInstallReceiver.PREF_ID, -1L));
    }

    @Test
    public void otherDownloadsAreIgnored() {
        UpdateInstallReceiver.finish(ctx, ID + 1, APK, true);
        assertNull(started());
        assertEquals("别人家的下载不该动我们的记录", ID,
                prefs.getLong(UpdateInstallReceiver.PREF_ID, -1L));
    }

    @Test
    public void unknownSourcePermissionIsAskedFirst() {
        shadowOf(ctx.getPackageManager()).setCanRequestPackageInstalls(false);

        UpdateInstallReceiver.finish(ctx, ID, APK, true);

        Intent request = started();
        assertNotNull(request);
        assertEquals(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, request.getAction());
        assertEquals("package:" + ctx.getPackageName(), String.valueOf(request.getData()));
        assertEquals("允许之后还要能回去点那一单", ID,
                prefs.getLong(UpdateInstallReceiver.PREF_ID, -1L));
    }

    @Test
    public void contentResolverStreamIsReadableForHashing() throws Exception {
        serve("hello adelie");
        ContentResolver resolver = ctx.getContentResolver();
        assertNotNull(resolver.openInputStream(APK));
    }
}
