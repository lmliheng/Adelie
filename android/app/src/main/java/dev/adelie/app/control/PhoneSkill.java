package dev.adelie.app.control;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;

/**
 * 把「手机操控」的用法装进这台手机上的 Adelie：每个 Agent 的技能目录里放一份 SKILL.md，
 * 再加上 $ADELIE_HOME/tools/phone.js 这个命令行入口。
 *
 * <p>dsh-go 是这么做的（技能包跟着 App 走），否则模型根本不知道本地有这么一个控制口。
 * 每次启动和每隔一分钟对一遍，新加的 Agent 也能拿到；内容没变就不重写文件。
 *
 * <p>Agent 目录是 {@code <ADELIE_HOME>/<项目>/agents/<id>/agent_state}——项目这一层以前漏了，
 * 技能写到了 {@code <ADELIE_HOME>/agents}，服务端根本扫不到，模型因此不知道自己能操作手机。
 * 现在把数据根下每个项目的 agents 都扫一遍，老的别名路径也保留。
 */
public final class PhoneSkill {

    public static final String SKILL_NAME = "phone-control";
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private PhoneSkill() {
    }

    /** @return 这次真正写入/更新的 Agent 数量；data 目录还没解出来时返回 -1。 */
    public static int ensure(Context ctx) {
        File data = dataRoot(ctx);
        if (data == null) return -1;

        String skill = readAsset(ctx, "phone-skill.md");
        String script = readAsset(ctx, "phone.js");
        if (skill == null || script == null) return -1;

        writeIfChanged(new File(data, "tools/phone.js"), script);

        int changed = 0;
        List<File> states = agentStates(data);
        for (int i = 0; i < states.size(); i++) {
            File target = new File(states.get(i), "skills/" + SKILL_NAME + "/SKILL.md");
            if (writeIfChanged(target, skill)) changed++;
        }
        return changed;
    }

    /** 已经装过几份（给设置页显示用）。 */
    public static int installed(Context ctx) {
        File data = dataRoot(ctx);
        if (data == null) return 0;
        int count = 0;
        List<File> states = agentStates(data);
        for (int i = 0; i < states.size(); i++) {
            if (new File(states.get(i), "skills/" + SKILL_NAME + "/SKILL.md").isFile()) count++;
        }
        return count;
    }

    /** 装到的 Agent 目录（排查用：技能到底落在哪儿）。 */
    public static List<String> installedAgentDirs(Context ctx) {
        List<String> out = new ArrayList<String>();
        File data = dataRoot(ctx);
        if (data == null) return out;
        List<File> states = agentStates(data);
        for (int i = 0; i < states.size(); i++) {
            File state = states.get(i);
            if (new File(state, "skills/" + SKILL_NAME + "/SKILL.md").isFile()) {
                File agent = state.getParentFile();
                if (agent != null) out.add(agent.getName());
            }
        }
        return out;
    }

    private static File dataRoot(Context ctx) {
        File data = new File(new File(ctx.getFilesDir(), "adelie"), "data");
        return data.isDirectory() ? data : null;
    }

    /**
     * 数据根下所有 Agent 的 agent_state 目录。
     *
     * <p>Adelie 的布局是 {@code <root>/<项目>/agents/<id>/agent_state}；项目 id 可以是
     * default_project，也可以由用户另起，所以不能写死。老版本的 {@code <root>/agents/<id>}
     * 也顺手认一下，免得升级上来的人掉队。
     */
    static List<File> agentStates(File data) {
        List<File> out = new ArrayList<File>();
        collectAgents(new File(data, "agents"), out);
        File[] children = data.listFiles();
        if (children != null) {
            for (int i = 0; i < children.length; i++) {
                File child = children[i];
                if (child == null) continue;
                // 只认「项目目录」：它下面得有 agents；tools / tmp 之类自然被筛掉
                File agents = new File(child, "agents");
                if (child.isDirectory() && agents.isDirectory()) collectAgents(agents, out);
            }
        }
        return out;
    }

    private static void collectAgents(File agents, List<File> out) {
        File[] list = agents.listFiles();
        if (list == null) return;
        for (int i = 0; i < list.length; i++) {
            File agent = list[i];
            if (agent == null || !agent.isDirectory()) continue;
            File state = new File(agent, "agent_state");
            if (out.contains(state)) continue;
            out.add(state);
        }
    }

    private static boolean writeIfChanged(File target, String text) {
        byte[] bytes = text.getBytes(UTF8);
        if (target.isFile() && target.length() == bytes.length) {
            byte[] have = new byte[bytes.length];
            InputStream in = null;
            try {
                in = new java.io.FileInputStream(target);
                int read = 0;
                while (read < have.length) {
                    int n = in.read(have, read, have.length - read);
                    if (n < 0) break;
                    read += n;
                }
                boolean same = read == have.length;
                for (int i = 0; same && i < have.length; i++) same = have[i] == bytes[i];
                if (same) return false;
            } catch (IOException ignored) {
            } finally {
                close(in);
            }
        }
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return false;
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(target);
            out.write(bytes);
            return true;
        } catch (IOException e) {
            return false;
        } finally {
            close(out);
        }
    }

    private static String readAsset(Context ctx, String name) {
        InputStream in = null;
        try {
            in = ctx.getAssets().open(name);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        } catch (IOException e) {
            return null;
        } finally {
            close(in);
        }
    }

    private static void close(java.io.Closeable c) {
        if (c == null) return;
        try {
            c.close();
        } catch (IOException ignored) {
        }
    }
}
