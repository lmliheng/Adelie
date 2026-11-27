package dev.adelie.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * `&lt;input type="file" accept="image/*" capture&gt;`：给了拍照入口，拍完那张图要回到网页里。
 *
 * <p>相机 App 不归我们管，真机上拍出来清不清楚只有手机说得准；这里锁住的是 Intent 怎么搭的、
 * 输出地址落在哪、以及结果回来时到底交回去哪一张。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class CaptureTest {

    private static final class Params extends WebChromeClient.FileChooserParams {
        private final String[] accept;
        private final boolean capture;

        Params(String[] accept, boolean capture) {
            this.accept = accept;
            this.capture = capture;
        }

        @Override
        public String[] getAcceptTypes() {
            return accept;
        }

        @Override
        public int getMode() {
            return MODE_OPEN;
        }

        @Override
        public boolean isCaptureEnabled() {
            return capture;
        }

        @Override
        public CharSequence getTitle() {
            return null;
        }

        @Override
        public String getFilenameHint() {
            return null;
        }

        @Override
        public Intent createIntent() {
            return null;
        }
    }

    private static final class Recorder implements ValueCallback<Uri[]> {
        final List<Uri[]> calls = new ArrayList<>();

        @Override
        public void onReceiveValue(Uri[] value) {
            calls.add(value);
        }

        Uri[] last() {
            return calls.isEmpty() ? null : calls.get(calls.size() - 1);
        }
    }

    /** FileProvider 把「authority → 路径映射」缓在静态字段里，每个用例的临时目录不同，得清掉。 */
    @org.junit.Before
    public void clearFileProviderCache() throws Exception {
        java.lang.reflect.Field cache =
                androidx.core.content.FileProvider.class.getDeclaredField("sCache");
        cache.setAccessible(true);
        Object map = cache.get(null);
        if (map instanceof java.util.Map) ((java.util.Map<?, ?>) map).clear();
    }

    /**
     * Robolectric 里一个应用都没装：先摆两个「相机应用」，让 queryIntentActivities 有东西可答。
     * 真机上这对应系统相机 / 相机 App 装在机器上；没装的机器走 {@link #launch(boolean)} 的 false。
     */
    private void installCameras() {
        android.content.pm.PackageManager pm =
                androidx.test.core.app.ApplicationProvider.getApplicationContext().getPackageManager();
        for (String action : new String[]{MediaStore.ACTION_IMAGE_CAPTURE,
                MediaStore.ACTION_VIDEO_CAPTURE}) {
            android.content.pm.ResolveInfo info = new android.content.pm.ResolveInfo();
            android.content.pm.ActivityInfo ai = new android.content.pm.ActivityInfo();
            ai.packageName = "com.android.camera";
            ai.name = "com.android.camera.CaptureActivity";
            info.activityInfo = ai;
            shadowOf(pm).addResolveInfoForIntent(new Intent(action), info);
        }
    }

    private ActivityController<MainActivity> launch() {
        return launch(true);
    }

    private ActivityController<MainActivity> launch(boolean withCamera) {
        if (withCamera) installCameras();
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        c.get().findViewById(R.id.splash).setVisibility(android.view.View.GONE);
        return c;
    }

    private WebChromeClient client(MainActivity a) {
        WebView web = a.findViewById(R.id.web);
        WebChromeClient client = shadowOf(web).getWebChromeClient();
        assertNotNull(client);
        return client;
    }

    /** 从 chooser 里取出那个拍照 intent；没有返回 null。 */
    private Intent cameraOf(Intent chooser) {
        Intent[] extra = chooser.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS) == null
                ? null : (Intent[]) chooser.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS);
        if (extra == null) return null;
        for (Intent i : extra) {
            if (i != null && MediaStore.ACTION_IMAGE_CAPTURE.equals(i.getAction())) return i;
        }
        return null;
    }

    /** 从 chooser 里按 action 找那个捕获 intent（拍照 / 录像）。 */
    private Intent captureOf(Intent chooser, String action) {
        android.os.Parcelable[] raw = chooser.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS);
        if (raw == null) return null;
        for (android.os.Parcelable p : raw) {
            if (p instanceof Intent && action.equals(((Intent) p).getAction())) return (Intent) p;
        }
        return null;
    }

    /** 把 FileProvider 的 content:// 地址换回 cache 里的那个文件，模拟相机往里写。 */
    private File fileOf(MainActivity a, Uri uri) {
        assertNotNull(uri);
        return new File(a.getCacheDir(), uri.getPath());
    }

    private void write(File file, String text) throws Exception {
        assertTrue(file.getParentFile().isDirectory() || file.getParentFile().mkdirs());
        OutputStream out = new FileOutputStream(file, false);
        try {
            out.write(text.getBytes("UTF-8"));
        } finally {
            out.close();
        }
    }

    @Test
    public void captureOnImageInputOffersCameraAndPicker() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        assertTrue(client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"image/*"}, true)));
        ShadowActivity.IntentForResult started = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull(started);
        assertEquals(MainActivity.REQ_FILE_CHOOSER, started.requestCode);
        assertEquals(Intent.ACTION_CHOOSER, started.intent.getAction());

        Intent camera = cameraOf(started.intent);
        assertNotNull("capture 的图片输入要有拍照这一项", camera);
        Uri out = camera.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        assertNotNull(out);
        assertEquals("content", out.getScheme());
        assertEquals("dev.adelie.app.files", out.getAuthority());
        assertTrue(out.getPath(), out.getPath().startsWith("/photos/shot-"));
        assertTrue(out.getPath(), out.getPath().endsWith(".jpg"));
        assertTrue((camera.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0);
        assertNotNull("相机拿不到 Uri 写文件时会退化成缩略图", camera.getClipData());
    }

    @Test
    public void withoutCaptureItIsAPlainPicker() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        assertTrue(client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"image/*"}, false)));
        ShadowActivity.IntentForResult started = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull(started);
        assertEquals(Intent.ACTION_GET_CONTENT, started.intent.getAction());
        assertNull(cameraOf(started.intent));
    }

    /** 视频输入给的是「录像」，不该冒出拍照那一项。 */
    @Test
    public void captureOnVideoInputOffersRecorder() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        assertTrue(client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"video/*"}, true)));
        ShadowActivity.IntentForResult started = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull(started);
        assertEquals(Intent.ACTION_CHOOSER, started.intent.getAction());
        assertNull("选视频不该给拍照入口", captureOf(started.intent, MediaStore.ACTION_IMAGE_CAPTURE));

        Intent recorder = captureOf(started.intent, MediaStore.ACTION_VIDEO_CAPTURE);
        assertNotNull("capture 的视频输入要有录像这一项", recorder);
        Uri out = recorder.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        assertNotNull(out);
        assertEquals("content", out.getScheme());
        assertEquals("dev.adelie.app.files", out.getAuthority());
        assertTrue(out.getPath(), out.getPath().startsWith("/videos/clip-"));
        assertTrue(out.getPath(), out.getPath().endsWith(".mp4"));
        assertTrue((recorder.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0);
        assertNotNull(recorder.getClipData());
        // 给 Agent 看的一段录像不该是长片：30 秒 / 48 MB 封顶（相机认这两个值才生效）
        assertEquals(30, recorder.getIntExtra(MediaStore.EXTRA_DURATION_LIMIT, -1));
        assertEquals(48L * 1024 * 1024,
                recorder.getLongExtra(MediaStore.EXTRA_SIZE_LIMIT, -1L));
        assertEquals(1, recorder.getIntExtra(MediaStore.EXTRA_VIDEO_QUALITY, -1));
    }

    /** 机器上根本没有相机应用：只给「从文件里选」，并且明说一句，别让人以为点了没反应。 */
    @Test
    public void withoutACameraAppItSaysSoAndFallsBackToThePicker() {
        ActivityController<MainActivity> c = launch(false);
        MainActivity a = c.get();

        assertTrue(client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"video/*"}, true)));
        ShadowActivity.IntentForResult started = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull(started);
        assertEquals("没有相机就退回去选文件", Intent.ACTION_GET_CONTENT, started.intent.getAction());
        assertEquals(a.getString(R.string.file_chooser_no_camera),
                org.robolectric.shadows.ShadowToast.getTextOfLatestToast());
    }

    /** 录完的视频要回到网页里，而不是让用户再去相册挑一遍。 */
    @Test
    public void videoGoesBackToThePage() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"video/*"}, true));
        Intent recorder = captureOf(shadowOf(a).getNextStartedActivityForResult().intent,
                MediaStore.ACTION_VIDEO_CAPTURE);
        assertNotNull(recorder);
        Uri out = recorder.getParcelableExtra(MediaStore.EXTRA_OUTPUT);

        write(fileOf(a, out), "mp4-bytes");
        // 用 EXTRA_OUTPUT 的相机回来后 data 是 null
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK, null);

        assertEquals(1, rec.calls.size());
        assertArrayEquals(new Uri[]{out}, rec.last());
    }

    /** 录了一半取消 / 相机没写东西：交回 null，别把空文件当视频发出去。 */
    @Test
    public void emptyVideoHandsBackNull() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"video/*"}, true));
        Intent recorder = captureOf(shadowOf(a).getNextStartedActivityForResult().intent,
                MediaStore.ACTION_VIDEO_CAPTURE);
        write(fileOf(a, recorder.getParcelableExtra(MediaStore.EXTRA_OUTPUT)), "");

        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK, null);
        assertNull(rec.last());
    }

    /** 图片和视频都收的输入：两个入口都给，标题也换了。 */
    @Test
    public void captureOnBothKindsOffersPhotoAndVideo() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        assertTrue(client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"image/*", "video/*"}, true)));
        Intent chooser = shadowOf(a).getNextStartedActivityForResult().intent;
        assertNotNull(captureOf(chooser, MediaStore.ACTION_IMAGE_CAPTURE));
        assertNotNull(captureOf(chooser, MediaStore.ACTION_VIDEO_CAPTURE));
        assertEquals(a.getString(R.string.file_chooser_capture_video_title),
                chooser.getCharSequenceExtra(Intent.EXTRA_TITLE).toString());
    }

    /** 只有视频时标题写「录像」，不是「拍照」。 */
    @Test
    public void videoOnlyChooserTitleSaysRecord() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"video/*"}, true));
        Intent chooser = shadowOf(a).getNextStartedActivityForResult().intent;
        assertEquals(a.getString(R.string.file_chooser_record_title),
                chooser.getCharSequenceExtra(Intent.EXTRA_TITLE).toString());
    }

    /** 第二次录像要换一个新文件，不能覆盖上一段。 */
    @Test
    public void secondVideoUsesAnotherFile() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        WebChromeClient client = client(a);
        client.onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"video/*"}, true));
        Uri first = captureOf(shadowOf(a).getNextStartedActivityForResult().intent,
                MediaStore.ACTION_VIDEO_CAPTURE).getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_CANCELED, null);

        client.onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"video/*"}, true));
        Uri second = captureOf(shadowOf(a).getNextStartedActivityForResult().intent,
                MediaStore.ACTION_VIDEO_CAPTURE).getParcelableExtra(MediaStore.EXTRA_OUTPUT);

        assertNotNull(second);
        assertFalse("两次录像不能写同一个文件", first.equals(second));
    }

    @Test
    public void wantsVideoRecognisesVideoShapes() {
        assertFalse(MainActivity.wantsVideo(null));
        assertFalse(MainActivity.wantsVideo(new ArrayList<String>()));
        assertTrue(MainActivity.wantsVideo(Arrays.asList("video/*")));
        assertTrue(MainActivity.wantsVideo(Arrays.asList("video/mp4")));
        assertTrue(MainActivity.wantsVideo(Arrays.asList("image/*", "video/*")));
        assertTrue(MainActivity.wantsVideo(Arrays.asList("*/*")));
        assertFalse(MainActivity.wantsVideo(Arrays.asList("image/*")));
        assertFalse(MainActivity.wantsVideo(Arrays.asList("application/pdf")));
    }

    @Test
    public void photoGoesBackToThePage() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, true));
        Intent camera = cameraOf(shadowOf(a).getNextStartedActivityForResult().intent);
        assertNotNull(camera);
        Uri out = camera.getParcelableExtra(MediaStore.EXTRA_OUTPUT);

        write(fileOf(a, out), "jpeg-bytes");
        // 用 EXTRA_OUTPUT 的相机回来后 data 是 null
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK, null);

        assertEquals(1, rec.calls.size());
        assertArrayEquals(new Uri[]{out}, rec.last());
    }

    /** 相机说成功但一个字节都没写（个别 ROM 忽略 EXTRA_OUTPUT）：别把空文件当照片发出去。 */
    @Test
    public void emptyPhotoHandsBackNull() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, true));
        Intent camera = cameraOf(shadowOf(a).getNextStartedActivityForResult().intent);
        write(fileOf(a, camera.getParcelableExtra(MediaStore.EXTRA_OUTPUT)), "");

        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK, null);

        assertEquals(1, rec.calls.size());
        assertNull(rec.last());
    }

    /** 拍照入口开着，用户却从「选文件」里挑了一张：交回去的是他挑的那张。 */
    @Test
    public void pickingAFileStillWins() throws Exception {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, true));
        Intent camera = cameraOf(shadowOf(a).getNextStartedActivityForResult().intent);
        write(fileOf(a, camera.getParcelableExtra(MediaStore.EXTRA_OUTPUT)), "jpeg-bytes");

        Uri picked = Uri.parse("content://com.android.providers.media.documents/document/image%3A7");
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK,
                new Intent().setData(picked));

        assertArrayEquals(new Uri[]{picked}, rec.last());
    }

    @Test
    public void cancelHandsBackNull() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, true));

        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_CANCELED, null);

        assertEquals(1, rec.calls.size());
        assertNull(rec.last());
    }

    /** 第二次拍照要换一个新文件，不能覆盖（也可能被网页引用着）上一张。 */
    @Test
    public void secondShotUsesAnotherFile() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        WebChromeClient client = client(a);
        client.onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"image/*"}, true));
        Uri first = cameraOf(shadowOf(a).getNextStartedActivityForResult().intent)
                .getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_CANCELED, null);

        client.onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[]{"image/*"}, true));
        Uri second = cameraOf(shadowOf(a).getNextStartedActivityForResult().intent)
                .getParcelableExtra(MediaStore.EXTRA_OUTPUT);

        assertNotNull(second);
        assertFalse("两次拍照不能写同一个文件", first.equals(second));
    }

    @Test
    public void wantsImageRecognisesEveryImageShape() {
        assertTrue(MainActivity.wantsImage(null));
        assertTrue(MainActivity.wantsImage(new ArrayList<String>()));
        assertTrue(MainActivity.wantsImage(Arrays.asList("image/*")));
        assertTrue(MainActivity.wantsImage(Arrays.asList("image/jpeg")));
        assertTrue(MainActivity.wantsImage(Arrays.asList("*/*")));
        assertFalse(MainActivity.wantsImage(Arrays.asList("video/*")));
        assertFalse(MainActivity.wantsImage(Arrays.asList("video/*", "application/pdf")));
    }
}
