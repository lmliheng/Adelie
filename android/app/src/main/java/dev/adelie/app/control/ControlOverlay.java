package dev.adelie.app.control;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.graphics.Bitmap;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import dev.adelie.app.MainActivity;

import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import dev.adelie.app.R;

/**
 * 手机操控的浮层：屏幕顶部那条胶囊（正在操作谁、这一步在做什么、暂停/停止），
 * 以及需要人点头时从底部升起的确认卡。
 *
 * <p>用 {@code TYPE_ACCESSIBILITY_OVERLAY} 挂在无障碍服务上，所以不需要额外申请
 * 「显示在其他应用上层」—— 服务自己就有这个窗口类型（API 22+）。
 */
final class ControlOverlay {

    /**
     * ONCE = 只做这一步；TASK = 这一轮都别再问；TRUST = 这个应用以后都别再问
     * （普通动作；付款、删除这类硬边界照样问）；CANCEL / TIMEOUT = 没做。
     */
    enum Answer {ONCE, TASK, TRUST, CANCEL, TIMEOUT}

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final int CONFIRM_TIMEOUT_SECONDS = 120;
    /** 最后这么多秒开始把倒计时变红，提醒人快点决定。 */
    private static final int CONFIRM_URGENT_SECONDS = 10;
    private static volatile long confirmDeadline;
    private static final Runnable CONFIRM_TICK = new Runnable() {
        @Override
        public void run() {
            TextView view = confirmTimer;
            if (view == null) return;
            long left = confirmDeadline - System.currentTimeMillis();
            if (left <= 0) {
                view.setText(R.string.control_confirm_expired);
                view.setTextColor(service.getColor(R.color.control_danger));
                final CountDownLatch latch = confirmLatch;
                if (latch != null) latch.countDown();
                hideConfirmNow();
                return;
            }
            int seconds = (int) Math.ceil(left / 1000.0);
            view.setText(service.getString(R.string.control_confirm_timer, countdownText(seconds)));
            view.setTextColor(service.getColor(
                    seconds <= CONFIRM_URGENT_SECONDS ? R.color.control_danger : R.color.control_muted));
            MAIN.postDelayed(this, 1000);
        }
    };

    private static volatile AccessibilityService service;
    private static WindowManager wm;

    private static View capsule;
    private static WindowManager.LayoutParams capsuleParams;
    private static TextView actionView;
    private static TextView metaView;
    private static TextView pauseView;
    private static ImageView iconView;

    private static String appLabel = "";
    private static int step;
    private static long startedAt;

    private static View confirmCard;
    private static TextView confirmTimer;
    private static CountDownLatch confirmLatch;

    private static View glow;
    private static volatile boolean glowEnabled = true;

    private static ImageView preview;

    private static final Runnable TICK = new Runnable() {
        @Override
        public void run() {
            if (capsule == null) return;
            if (metaView != null) metaView.setText(metaText());
            MAIN.postDelayed(this, 1000);
        }
    };

    private ControlOverlay() {
    }

    static void attach(AccessibilityService s) {
        service = s;
        wm = (WindowManager) s.getSystemService(Context.WINDOW_SERVICE);
    }

    static void detach() {
        service = null;
        wm = null;
        final CountDownLatch latch = confirmLatch;
        if (latch != null) latch.countDown();
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                hideCapsuleNow();
                hideConfirmNow();
            }
        });
    }

    static boolean ready() {
        return service != null && wm != null;
    }

    // ------------------------------------------------------------------ 胶囊

    /** 显示/刷新胶囊。可以由任何线程调，内部切到主线程。 */
    static void showCapsule(final String action, final String app, final int stepNo, final long since) {
        appLabel = app == null ? "" : app;
        step = stepNo;
        startedAt = since;
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (!ready()) return;
                if (capsule == null) buildCapsule();
                if (capsule == null) return;
                if (actionView != null) actionView.setText(action == null ? "" : action);
                if (metaView != null) metaView.setText(metaText());
                if (iconView != null) iconView.setImageDrawable(appIcon());
                if (pauseView != null) {
                    pauseView.setText(PhoneControl.isPaused()
                            ? R.string.control_resume : R.string.control_pause);
                }
                if (capsule.getParent() == null) {
                    try {
                        wm.addView(capsule, capsuleParams);
                    } catch (Exception ignored) {
                        capsule = null;
                        return;
                    }
                }
                showGlowNow();
                MAIN.removeCallbacks(TICK);
                MAIN.postDelayed(TICK, 1000);
            }
        });
    }

    static void hideCapsule() {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                MAIN.removeCallbacks(TICK);
                hideCapsuleNow();
            }
        });
    }

    private static void hideCapsuleNow() {
        hideGlowNow();
        if (capsule == null) return;
        try {
            if (capsule.getParent() != null) wm.removeView(capsule);
        } catch (Exception ignored) {
        }
        capsule = null;
        actionView = null;
        metaView = null;
        pauseView = null;
        iconView = null;
    }

    private static void buildCapsule() {
        try {
            capsule = LayoutInflater.from(service).inflate(R.layout.overlay_capsule, null);
        } catch (Exception e) {
            capsule = null;
            return;
        }
        actionView = capsule.findViewById(R.id.ov_action);
        metaView = capsule.findViewById(R.id.ov_meta);
        pauseView = capsule.findViewById(R.id.ov_pause);
        iconView = capsule.findViewById(R.id.ov_icon);
        TextView stopView = capsule.findViewById(R.id.ov_stop);

        View.OnClickListener onBack = new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    android.content.Intent intent = new android.content.Intent(service, MainActivity.class);
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                            | android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    service.startActivity(intent);
                } catch (Exception ignored) {
                }
            }
        };
        iconView.setOnClickListener(onBack);
        actionView.setOnClickListener(onBack);
        if (metaView != null) metaView.setOnClickListener(onBack);

        pauseView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                PhoneControl.togglePause();
                pauseView.setText(PhoneControl.isPaused()
                        ? R.string.control_resume : R.string.control_pause);
                if (metaView != null) metaView.setText(metaText());
            }
        });
        stopView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                PhoneControl.stopByUser();
            }
        });

        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(m);
        capsuleParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        capsuleParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        capsuleParams.y = dp(6);

        // 拖一下能挪位置（点按钮不会误拖：按钮自己吃掉了点击）
        capsule.setOnTouchListener(new View.OnTouchListener() {
            float downX;
            float downY;
            int startX;
            int startY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = event.getRawX();
                        downY = event.getRawY();
                        startX = capsuleParams.x;
                        startY = capsuleParams.y;
                        return false;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = event.getRawX() - downX;
                        float dy = event.getRawY() - downY;
                        if (Math.abs(dx) < dp(6) && Math.abs(dy) < dp(6)) return false;
                        capsuleParams.gravity = Gravity.TOP | Gravity.START;
                        capsuleParams.x = Math.max(0, startX + (int) dx);
                        capsuleParams.y = Math.max(0, startY + (int) dy);
                        try {
                            wm.updateViewLayout(capsule, capsuleParams);
                        } catch (Exception ignored) {
                        }
                        return true;
                    }
                    default:
                        return false;
                }
            }
        });
    }

    private static String metaText() {
        long seconds = Math.max(0, (System.currentTimeMillis() - startedAt) / 1000);
        String time = seconds < 60
                ? seconds + " 秒"
                : String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
        String app = appLabel.isEmpty() ? "手机操控" : appLabel;
        String base = step <= 1
                ? app + " · " + time
                : app + " · 第 " + step + " 步 · " + time;
        // 通知栏上点了「免确认」：浮层上也留个记号，免得人以为确认卡坏了
        return PhoneControl.allowAllNow() ? base + " · 免确认" : base;
    }

    private static Drawable appIcon() {
        Drawable fallback = null;
        try {
            PackageManager pm = service.getPackageManager();
            Drawable d = pm.getDefaultActivityIcon();
            fallback = d;
            String pkg = PhoneControl.foreground();
            if (pkg == null || pkg.isEmpty()) return d;
            return pm.getApplicationIcon(pkg);
        } catch (Exception e) {
            return fallback;
        }
    }

    // ------------------------------------------------------------------ 确认卡

    /**
     * 弹一张确认卡并等用户点，最多两分钟。自己撤销、服务掉了、超时，都算「取消」。
     */
    static Answer confirm(String reason) {
        if (!ready()) return Answer.CANCEL;
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<Answer> answer = new AtomicReference<>(Answer.CANCEL);
        confirmLatch = latch;

        MAIN.post(new Runnable() {
            @Override
            public void run() {
                buildConfirm(reason, answer, latch);
            }
        });

        try {
            if (!latch.await(CONFIRM_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                answer.set(Answer.TIMEOUT);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            answer.set(Answer.CANCEL);
        }
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                hideConfirmNow();
            }
        });
        confirmLatch = null;
        return answer.get();
    }

    /**
     * 让确认卡在任何屏幕上都能完整看见。
     *
     * <p>两件事：屏幕太窄（或用户把字体调大了）时一排按钮放不下 —— 改成竖着排，
     * 不然「允许一次」会被挤出屏幕；理由太长（比如一长串要确认的动作名）时只让文字区滚动，
     * 按钮永远留在卡片底部，人不会看到一个点不着的确认卡。
     */
    static void fitCard(View card, int widthPx, int maxHeightPx, int gapPx) {
        if (card == null) return;
        View buttons = card.findViewById(R.id.cf_buttons);
        View scroll = card.findViewById(R.id.cf_scroll);
        if (!(buttons instanceof LinearLayout) || scroll == null) return;
        LinearLayout row = (LinearLayout) buttons;

        int widthSpec = View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY);
        int freeHeight = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);

        // 每次都从「一行三个」的默认样子开始算，重复调用不会越排越怪
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (int i = 0; i < row.getChildCount(); i++) {
            View child = row.getChildAt(i);
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) child.getLayoutParams();
            lp.topMargin = 0;
            lp.bottomMargin = 0;
            lp.leftMargin = i == 0 ? 0 : gapPx;
            lp.rightMargin = 0;
            child.setLayoutParams(lp);
        }
        ViewGroup.LayoutParams scrollLp = scroll.getLayoutParams();
        scrollLp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
        scroll.setLayoutParams(scrollLp);
        card.measure(widthSpec, freeHeight);

        int available = widthPx - card.getPaddingLeft() - card.getPaddingRight();
        if (rowWidth(row, freeHeight) > available) {
            row.setOrientation(LinearLayout.VERTICAL);
            for (int i = 0; i < row.getChildCount(); i++) {
                View child = row.getChildAt(i);
                LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) child.getLayoutParams();
                lp.topMargin = i == 0 ? 0 : gapPx;
                lp.leftMargin = 0;
                lp.rightMargin = 0;
                child.setLayoutParams(lp);
            }
            card.measure(widthSpec, freeHeight);
        }

        int over = card.getMeasuredHeight() - maxHeightPx;
        if (over > 0) {
            // 多出来的高度只能从文字区拿走；留三行左右的底，别缩成一条缝
            int target = Math.max(gapPx * 6, scroll.getMeasuredHeight() - over);
            ViewGroup.LayoutParams lp = scroll.getLayoutParams();
            lp.height = target;
            scroll.setLayoutParams(lp);
            card.measure(widthSpec,
                    View.MeasureSpec.makeMeasureSpec(maxHeightPx, View.MeasureSpec.AT_MOST));
        }
    }

    /** 这一排按钮横着排需要多宽（含间距）。 */
    private static int rowWidth(ViewGroup row, int heightSpec) {
        int total = 0;
        for (int i = 0; i < row.getChildCount(); i++) {
            View child = row.getChildAt(i);
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) child.getLayoutParams();
            child.measure(View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                    heightSpec);
            total += child.getMeasuredWidth() + lp.leftMargin + lp.rightMargin;
        }
        return total;
    }

    private static void buildConfirm(final String reason, final AtomicReference<Answer> answer,
                                     final CountDownLatch latch) {
        if (!ready()) {
            latch.countDown();
            return;
        }
        hideConfirmNow();
        try {
            confirmCard = LayoutInflater.from(service).inflate(R.layout.overlay_confirm, null);
        } catch (Exception e) {
            confirmCard = null;
            latch.countDown();
            return;
        }
        TextView reasonView = confirmCard.findViewById(R.id.cf_reason);
        reasonView.setText(reason == null ? "" : reason);

        // 卡片上写清楚多久会自动取消：不然它过两分钟自己消失，人以为是坏了
        confirmTimer = confirmCard.findViewById(R.id.cf_timer);
        confirmDeadline = System.currentTimeMillis() + CONFIRM_TIMEOUT_SECONDS * 1000L;
        if (confirmTimer != null) {
            confirmTimer.setText(service.getString(R.string.control_confirm_timer,
                    countdownText(CONFIRM_TIMEOUT_SECONDS)));
            confirmTimer.setTextColor(service.getColor(R.color.control_muted));
        }
        MAIN.removeCallbacks(CONFIRM_TICK);
        MAIN.postDelayed(CONFIRM_TICK, 1000);

        View.OnClickListener pick = new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (v.getId() == R.id.cf_allow) answer.set(Answer.ONCE);
                else if (v.getId() == R.id.cf_allow_task) answer.set(Answer.TASK);
                else if (v.getId() == R.id.cf_allow_app) answer.set(Answer.TRUST);
                else answer.set(Answer.CANCEL);
                latch.countDown();
                hideConfirmNow();
            }
        };
        confirmCard.findViewById(R.id.cf_allow).setOnClickListener(pick);
        confirmCard.findViewById(R.id.cf_allow_task).setOnClickListener(pick);
        confirmCard.findViewById(R.id.cf_allow_app).setOnClickListener(pick);
        confirmCard.findViewById(R.id.cf_cancel).setOnClickListener(pick);

        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(m);
        int cardWidth = m.widthPixels - dp(24);
        // 上下各留一段：卡片是贴底弹的，顶上不能被状态栏吃掉，底下不压住导航栏
        int maxCardHeight = Math.max(dp(220), m.heightPixels - dp(28) - dp(72) * 2);
        fitCard(confirmCard, cardWidth, maxCardHeight, dp(8));
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                cardWidth,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(28);
        try {
            wm.addView(confirmCard, lp);
        } catch (Exception e) {
            confirmCard = null;
            latch.countDown();
        }
    }

    /** 任务被停掉时，挂着的确认卡也要作废，不能让调用方干等两分钟。 */
    static void cancelConfirm() {
        final CountDownLatch latch = confirmLatch;
        if (latch != null) latch.countDown();
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                hideConfirmNow();
            }
        });
    }

    private static void hideConfirmNow() {
        MAIN.removeCallbacks(CONFIRM_TICK);
        confirmTimer = null;
        if (confirmCard == null) return;
        try {
            if (confirmCard.getParent() != null) wm.removeView(confirmCard);
        } catch (Exception ignored) {
        }
        confirmCard = null;
    }

    /** 「1:58」这种写法；一分钟以内只说秒数。 */
    static String countdownText(int secondsLeft) {
        int seconds = Math.max(0, secondsLeft);
        if (seconds < 60) return seconds + " 秒";
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }

    // ------------------------------------------------------------------ 边缘光带

    static void setGlowEnabled(boolean on) {
        glowEnabled = on;
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (glowEnabled) {
                    if (capsule != null) showGlowNow();
                } else {
                    hideGlowNow();
                }
            }
        });
    }

    private static void showGlowNow() {
        if (!glowEnabled || !ready() || glow != null) return;
        try {
            glow = new EdgeGlowView(service);
            DisplayMetrics m = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(m);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    m.widthPixels, m.heightPixels,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.START;
            wm.addView(glow, lp);
        } catch (Exception e) {
            glow = null;
        }
    }

    private static void hideGlowNow() {
        if (glow == null) return;
        try {
            if (glow.getParent() != null) wm.removeView(glow);
        } catch (Exception ignored) {
        }
        glow = null;
    }

    // ------------------------------------------------------------------ 后台屏小窗

    static boolean previewVisible() {
        return preview != null;
    }

    /** 后台屏的实时画面：贴右侧的小窗，跟着帧更新。 */
    static void showPreview(final Bitmap frame) {
        if (frame == null) return;
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (!ready()) {
                    frame.recycle();
                    return;
                }
                if (preview == null && !buildPreview()) {
                    frame.recycle();
                    return;
                }
                if (preview != null) {
                    preview.setImageBitmap(frame);
                    if (preview.getParent() == null) {
                        try {
                            wm.addView(preview, previewParams());
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
        });
    }

    static void hidePreview() {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (preview == null) return;
                try {
                    if (preview.getParent() != null) wm.removeView(preview);
                } catch (Exception ignored) {
                }
                preview = null;
            }
        });
    }

    private static boolean buildPreview() {
        if (!ready()) return false;
        try {
            preview = new ImageView(service);
            preview.setScaleType(ImageView.ScaleType.FIT_CENTER);
            preview.setBackgroundResource(R.drawable.ov_card);
            preview.setClipToOutline(true);
            preview.setPadding(dp(2), dp(2), dp(2), dp(2));
            return true;
        } catch (Exception e) {
            preview = null;
            return false;
        }
    }

    private static WindowManager.LayoutParams previewParams() {
        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(m);
        int w = Math.round(m.widthPixels * 0.34f);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                w, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.END;
        lp.x = dp(10);
        lp.y = dp(56);
        return lp;
    }

    // ------------------------------------------------------------------ 截图时让开

    /**
     * 截图会连自己的浮层一起拍下来 —— 模型看到「读屏」「暂停」这些字会分不清是谁的界面。
     * 拍之前把胶囊和光带摘掉，拍完再挂回去。
     */
    static void suspendForCapture() {
        final CountDownLatch latch = new CountDownLatch(1);
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (capsule != null && capsule.getParent() != null) wm.removeView(capsule);
                } catch (Exception ignored) {
                }
                hideGlowNow();
                latch.countDown();
            }
        });
        try {
            latch.await(1, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** 截图之后把浮层挂回去（任务还在跑才挂）。 */
    static void resumeAfterCapture() {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (!ready() || !PhoneControl.sessionAlive()) return;
                if (capsule != null && capsule.getParent() == null) {
                    try {
                        wm.addView(capsule, capsuleParams);
                        showGlowNow();
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    private static int dp(float v) {
        float density = service == null ? 3f
                : service.getResources().getDisplayMetrics().density;
        return Math.round(density * v);
    }

    /** 只给测试用：确认卡的决策不依赖真实浮层。 */
    static JSONObject describe() {
        JSONObject o = new JSONObject();
        try {
            o.put("capsule", capsule != null);
            o.put("confirm", confirmCard != null);
        } catch (Exception ignored) {
        }
        return o;
    }
}
