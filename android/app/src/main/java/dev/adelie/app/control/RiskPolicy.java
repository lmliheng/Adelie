package dev.adelie.app.control;

import org.json.JSONObject;

import java.util.Locale;

/**
 * 「这一步要不要先问人」的判断 —— 照 dsh-go 的规则收窄到几条：
 * 进新应用、发送消息、删除东西、付款/下单、安装/卸载之前先问一次。
 *
 * <p>纯函数，方便单测：给动作 + 命中的控件文字，返回要问的理由（不用问就返回 null）。
 */
final class RiskPolicy {

    /** 一看到这些词，就当成「不可逆或者对外发出去」的动作。 */
    private static final String[] WORDS = {
            "发送", "发出", "提交", "确定", "确认", "删除", "清空", "移除",
            "支付", "付款", "购买", "下单", "结算", "转账", "红包",
            "安装", "卸载", "更新", "升级", "授权", "允许", "同意",
            "退出登录", "注销", "解绑", "拉黑", "举报", "投诉",
    };

    /**
     * 这里面是「做完就退不回来」的：钱出去了、东西没了、系统权限给了。
     * 就算用户在这一轮点了「免确认」，这些也照样问一次 —— 免确认是省点头，不是把刹车拆了。
     */
    private static final String[] HARD_WORDS = {
            "支付", "付款", "购买", "下单", "结算", "转账", "红包", "充值",
            "删除", "清空", "格式化", "卸载", "安装", "更新并安装",
            "退出登录", "注销", "解绑",
    };

    private RiskPolicy() {
    }

    /**
     * @param action tap / open / key / text ...
     * @param req    原始请求（拿 text、name、package）
     * @param label  已经解析出来的目标控件文字（不知道就传 null）
     * @return 要问人的理由；null 表示可以直接做
     */
    static String reason(String action, JSONObject req, String label) {
        if ("open".equals(action) || "launch".equals(action)) {
            String name = firstNonEmpty(req.optString("name"), req.optString("package"));
            return "要打开「" + (name.isEmpty() ? "另一个应用" : name) + "」";
        }
        if (!"tap".equals(action) && !"click".equals(action)) return null;

        String target = label == null ? "" : label.trim();
        if (target.isEmpty()) target = req.optString("text", "").trim();
        if (target.isEmpty()) return null;

        String lower = target.toLowerCase(Locale.ROOT);
        for (String word : WORDS) {
            if (target.contains(word) || lower.contains(word)) {
                return "要点「" + shorten(target) + "」";
            }
        }
        return null;
    }

    /**
     * 带「本轮是否免确认」的重载：免确认只管普通动作（发送、打开应用…），
     * 硬风险（付款、删除、安装…）永远要人点头。
     */
    static String reason(String action, JSONObject req, String label, boolean allowAll) {
        String hard = hardReason(action, req, label);
        if (hard != null) return hard;
        if (allowAll) return null;
        return reason(action, req, label);
    }

    /** 这一步是不是硬风险；不是返回 null。 */
    static String hardReason(String action, JSONObject req, String label) {
        if (!"tap".equals(action) && !"click".equals(action)) return null;
        String target = label == null ? "" : label.trim();
        if (target.isEmpty()) target = req.optString("text", "").trim();
        if (target.isEmpty()) return null;
        for (String word : HARD_WORDS) {
            if (target.contains(word)) {
                return "要点「" + shorten(target) + "」，做完退不回来，这一步总要你点头";
            }
        }
        return null;
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        if (b != null && !b.trim().isEmpty()) return b.trim();
        return "";
    }

    private static String shorten(String s) {
        String t = s.replace('\n', ' ').trim();
        return t.length() <= 12 ? t : t.substring(0, 12) + "…";
    }
}
