package dev.adelie.app.control;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import org.json.JSONObject;

import dev.adelie.app.ProjectionService;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * 后台屏的第一块：MediaProjection 授权 + 一块虚拟显示 + 帧流。
 *
 * <p>用途跟 dsh-go 的「后台屏」一个思路：把被操作的应用放到这块虚拟显示上跑，
 * 用户自己的屏幕还能继续用；这里负责拿授权、建显示、出画面，以及给上层读帧。
 * 授权必须来自一个 Activity（系统要求），所以有个透明的 {@link ProjectionActivity}。
 *
 * <p>注意：虚拟显示上能不能启动别的应用受系统版本影响，起不来时把原因照实写进
 * {@link #status()}，界面上有自检可以看到，不假装成功。
 */
public final class Projection {

    private static final Object LOCK = new Object();

    private static volatile MediaProjection projection;
    private static volatile VirtualDisplay display;
    private static volatile ImageReader reader;
    private static volatile HandlerThread thread;
    private static volatile Bitmap latest;
    private static volatile int frames;
    private static volatile long startedAt;
    private static volatile long lastPreviewAt;
    private static volatile String error = "";
    private static volatile String lastLaunch = "";
    private static volatile Context appContext;
    private static int width;
    private static int height;
    private static int density;

    private Projection() {
    }

    static void attachContext(Context ctx) {
        appContext = ctx;
    }

    public static boolean active() {
        return display != null;
    }

    public static int displayId() {
        VirtualDisplay d = display;
        return d == null || d.getDisplay() == null ? -1 : d.getDisplay().getDisplayId();
    }

    public static String lastError() {
        return error;
    }

    /** 从控制口来的「去授权 / 关掉」。授权必须由 Activity 发起。 */
    public static void requestConsent(Context ctx) {
        Intent intent = new Intent(ctx, ProjectionActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (Exception e) {
            error = "打不开授权页：" + e;
        }
    }

    /** 用户同意之后由 {@link ProjectionActivity} 调进来。 */
    public static void start(Activity host, Intent data) {
        synchronized (LOCK) {
            stop();
            try {
                MediaProjectionManager manager =
                        (MediaProjectionManager) host.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                if (manager == null) throw new IllegalStateException("没有 MediaProjectionManager");
                MediaProjection mp = manager.getMediaProjection(Activity.RESULT_OK, data);
                if (mp == null) throw new IllegalStateException("系统没给 MediaProjection");

                // Android 14 起：拿到授权后、建虚拟显示前必须先有 mediaProjection 类型的前台服务
                ProjectionService.start(host.getApplicationContext());

                DisplayMetrics m = new DisplayMetrics();
                WindowManager wm = (WindowManager) host.getSystemService(Context.WINDOW_SERVICE);
                wm.getDefaultDisplay().getRealMetrics(m);
                width = m.widthPixels;
                height = m.heightPixels;
                density = m.densityDpi;

                HandlerThread t = new HandlerThread("adelie-projection");
                t.start();
                thread = t;

                ImageReader ir = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
                ir.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                    @Override
                    public void onImageAvailable(ImageReader r) {
                        consume(r);
                    }
                }, new Handler(t.getLooper()));
                reader = ir;

                // PUBLIC：这块显示对其他应用可见，别的应用可以被启动到这里
                VirtualDisplay vd = mp.createVirtualDisplay("adelie-backstage", width, height,
                        density, DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC, ir.getSurface(), null, null);
                if (vd == null) throw new IllegalStateException("createVirtualDisplay 返回空");
                display = vd;
                projection = mp;
                mp.registerCallback(new MediaProjection.Callback() {
                    @Override
                    public void onStop() {
                        stop();
                    }
                }, new Handler(t.getLooper()));

                frames = 0;
                startedAt = System.currentTimeMillis();
                error = "";
            } catch (Exception e) {
                error = e.getClass().getSimpleName() + ": " + e.getMessage();
                stop();
            }
        }
    }

    public static void stop() {
        synchronized (LOCK) {
            VirtualDisplay d = display;
            ImageReader r = reader;
            MediaProjection mp = projection;
            HandlerThread t = thread;
            display = null;
            reader = null;
            projection = null;
            thread = null;
            try {
                if (d != null) d.release();
            } catch (Exception ignored) {
            }
            try {
                if (r != null) r.close();
            } catch (Exception ignored) {
            }
            try {
                if (mp != null) mp.stop();
            } catch (Exception ignored) {
            }
            if (t != null) {
                try {
                    t.quitSafely();
                } catch (Exception ignored) {
                }
            }
            ControlOverlay.hidePreview();
            Context ctx = appContext;
            if (ctx != null) ProjectionService.stop(ctx);
        }
    }

    /** 读到一帧：留一份原图给 capture，另一份缩小了喂小窗。 */
    private static void consume(ImageReader r) {
        Image image = null;
        try {
            image = r.acquireLatestImage();
            if (image == null) return;
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int rowStride = plane.getRowStride();
            int pixelStride = plane.getPixelStride();
            int w = image.getWidth();
            int h = image.getHeight();
            int padding = rowStride - pixelStride * w;
            Bitmap raw = Bitmap.createBitmap(w + padding / pixelStride, h, Bitmap.Config.ARGB_8888);
            raw.copyPixelsFromBuffer(buffer);
            Bitmap cropped = Bitmap.createBitmap(raw, 0, 0, w, h);
            if (cropped != raw) raw.recycle();
            latest = cropped;
            frames++;

            long now = System.currentTimeMillis();
            if (now - lastPreviewAt > 200) {
                lastPreviewAt = now;
                int previewWidth = Math.max(160, w / 3);
                int previewHeight = Math.max(120, Math.round(h * (previewWidth / (float) w)));
                Bitmap small = Bitmap.createScaledBitmap(cropped, previewWidth, previewHeight, true);
                ControlOverlay.showPreview(small);
            }
        } catch (Throwable ignored) {
        } finally {
            if (image != null) {
                try {
                    image.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /** 把最近一帧按需要缩小后给出去（base64）。 */
    public static JSONObject capture(int maxWidth, int quality) throws Exception {
        Bitmap bmp = latest;
        JSONObject out = new JSONObject();
        if (bmp == null) {
            out.put("ok", false);
            out.put("error", "projection_off");
            out.put("message", "后台屏还没有画面：先在 设置 → 手机操控 → 后台屏 里授权");
            return out;
        }
        Bitmap copy = bmp.copy(Bitmap.Config.ARGB_8888, false);
        if (copy.getWidth() > maxWidth) {
            int h = Math.round(copy.getHeight() * (maxWidth / (float) copy.getWidth()));
            Bitmap scaled = Bitmap.createScaledBitmap(copy, maxWidth, h, true);
            copy.recycle();
            copy = scaled;
        }
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        copy.compress(Bitmap.CompressFormat.JPEG, quality, buf);
        int w = copy.getWidth();
        int h = copy.getHeight();
        copy.recycle();
        byte[] bytes = buf.toByteArray();
        out.put("ok", true);
        out.put("width", w);
        out.put("height", h);
        out.put("format", "jpeg");
        out.put("bytes", bytes.length);
        out.put("image", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
        out.put("frames", frames);
        out.put("display", displayId());
        return out;
    }

    /** 在虚拟显示上启动某个应用（后台屏的核心动作）。 */
    public static JSONObject launchOnDisplay(Context ctx, String pkg) throws Exception {
        JSONObject out = new JSONObject();
        if (!active()) {
            out.put("ok", false);
            out.put("error", "projection_off");
            out.put("message", "后台屏没开：先授权");
            return out;
        }
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
        if (intent == null) {
            out.put("ok", false);
            out.put("error", "not_launchable");
            out.put("message", pkg + " 没有启动入口");
            return out;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                android.app.ActivityOptions options = android.app.ActivityOptions.makeBasic();
                options.setLaunchDisplayId(displayId());
                ctx.startActivity(intent, options.toBundle());
            } else {
                ctx.startActivity(intent);
            }
            lastLaunch = pkg;
            out.put("ok", true);
            out.put("package", pkg);
            out.put("display", displayId());
        } catch (Exception e) {
            error = "在虚拟显示上启动失败：" + e.getMessage();
            out.put("ok", false);
            out.put("error", "launch_on_display_failed");
            out.put("message", "系统不允许把应用启动到虚拟显示：" + e.getMessage());
        }
        return out;
    }

    public static JSONObject status() throws Exception {
        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("active", active());
        out.put("display", displayId());
        out.put("frames", frames);
        out.put("lastLaunch", lastLaunch);
        out.put("error", error);
        if (active()) {
            out.put("size", width + "x" + height);
            out.put("seconds", (System.currentTimeMillis() - startedAt) / 1000);
        }
        return out;
    }
}
