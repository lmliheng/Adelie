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
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowActivity;
import org.robolectric.shadows.ShadowWebView;

import java.util.ArrayList;
import java.util.List;

/**
 * 网页里的「选文件」：聊天里发图、给 Agent 加附件全靠它。
 *
 * <p>WebView 不接 onShowFileChooser，前端 &lt;input type="file"&gt; 点了就是没反应；
 * 这里锁住「叫出系统选择器 → 拿回 Uri → 交还给网页」这条链路，包括取消和并发点击。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
public class FileChooserTest {

    private ActivityController<MainActivity> launch() {
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        c.get().findViewById(R.id.splash).setVisibility(android.view.View.GONE);
        return c;
    }

    /** 系统给 WebView 的那种参数；这里只实现我们真正读的几个。 */
    private static final class Params extends WebChromeClient.FileChooserParams {
        private final String[] accept;
        private final int mode;

        Params(String[] accept, int mode) {
            this.accept = accept;
            this.mode = mode;
        }

        @Override
        public String[] getAcceptTypes() {
            return accept;
        }

        @Override
        public int getMode() {
            return mode;
        }

        @Override
        public boolean isCaptureEnabled() {
            return false;
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

    private WebChromeClient client(MainActivity a) {
        WebView web = a.findViewById(R.id.web);
        WebChromeClient client = shadowOf(web).getWebChromeClient();
        assertNotNull("WebView 得挂上 WebChromeClient", client);
        return client;
    }

    @Test
    public void imageAcceptOpensAPickerForImages() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();

        boolean handled = client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, WebChromeClient.FileChooserParams.MODE_OPEN));

        assertTrue(handled);
        ShadowActivity.IntentForResult started = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull("应该拉起系统的文件选择器", started);
        assertEquals(MainActivity.REQ_FILE_CHOOSER, started.requestCode);
        assertEquals(Intent.ACTION_GET_CONTENT, started.intent.getAction());
        assertEquals("image/*", started.intent.getType());
        assertTrue(started.intent.hasCategory(Intent.CATEGORY_OPENABLE));
        // 结果回来之前不许提前回调
        assertTrue(rec.calls.isEmpty());
    }

    @Test
    public void severalAcceptTypesGoThroughExtraMimeTypes() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();

        boolean handled = client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*", "application/pdf"},
                        WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE));

        assertTrue(handled);
        ShadowActivity.IntentForResult started = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull(started);
        assertEquals("*/*", started.intent.getType());
        assertArrayEquals(new String[]{"image/*", "application/pdf"},
                started.intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
        assertTrue(started.intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
    }

    @Test
    public void unknownAcceptFallsBackToAnything() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();

        assertTrue(client(a).onShowFileChooser(a.findViewById(R.id.web), new Recorder(),
                new Params(new String[0], WebChromeClient.FileChooserParams.MODE_OPEN)));
        assertEquals("*/*", shadowOf(a).getNextStartedActivityForResult().intent.getType());
        assertFalse(shadowOf(a).getNextStartedActivityForResult().intent
                .getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
    }

    @Test
    public void chosenUriIsHandedBackToThePage() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, WebChromeClient.FileChooserParams.MODE_OPEN));

        Uri picked = Uri.parse("content://com.android.providers.media.documents/document/image%3A42");
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK,
                new Intent().setData(picked));

        assertEquals(1, rec.calls.size());
        assertArrayEquals(new Uri[]{picked}, rec.last());
    }

    @Test
    public void cancelHandsBackNull() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder rec = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), rec,
                new Params(new String[]{"image/*"}, WebChromeClient.FileChooserParams.MODE_OPEN));

        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_CANCELED, null);

        assertEquals(1, rec.calls.size());
        assertNull(rec.last());
    }

    @Test
    public void secondTapReleasesTheFirstCallback() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        Recorder first = new Recorder();
        Recorder second = new Recorder();
        client(a).onShowFileChooser(a.findViewById(R.id.web), first,
                new Params(new String[]{"image/*"}, WebChromeClient.FileChooserParams.MODE_OPEN));
        client(a).onShowFileChooser(a.findViewById(R.id.web), second,
                new Params(new String[]{"image/*"}, WebChromeClient.FileChooserParams.MODE_OPEN));

        // 第一次必须被放开，否则网页那边一直转圈
        assertEquals(1, first.calls.size());
        assertNull(first.last());
        assertTrue(second.calls.isEmpty());

        Uri picked = Uri.parse("content://media/external/images/media/7");
        a.onActivityResult(MainActivity.REQ_FILE_CHOOSER, Activity.RESULT_OK,
                new Intent().setData(picked));
        assertArrayEquals(new Uri[]{picked}, second.last());
    }

    @Test
    public void otherRequestCodesStillGoToSuper() {
        ActivityController<MainActivity> c = launch();
        MainActivity a = c.get();
        a.onActivityResult(999, Activity.RESULT_OK, null);
        // 不崩就是通过：别的请求码不能被文件选择器吞掉
    }
}
