package world.hotpoor.sayagain.watch;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/** Explicit user requests use the system's narrowly declared force-lock policy. */
public final class ScreenLockController {
    public static final int REQUEST_DEVICE_ADMIN = 120;
    private ScreenLockController() { }

    private static DevicePolicyManager manager(Context context) {
        return (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    public static ComponentName component(Context context) {
        return new ComponentName(context, LockScreenAdminReceiver.class);
    }

    public static boolean isAdminActive(Context context) {
        try {
            DevicePolicyManager policy = manager(context);
            return policy != null && policy.isAdminActive(component(context));
        } catch (RuntimeException unavailable) { return false; }
    }

    public static void requestLock(Activity activity) {
        if (isAdminActive(activity)) { lock(activity); return; }
        Intent request = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
        request.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, component(activity));
        request.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "仅用于快捷锁屏，录音继续。可随时在系统设置中撤销授权。");
        try { activity.startActivityForResult(request, REQUEST_DEVICE_ADMIN); }
        catch (RuntimeException unavailable) { toast(activity, "这台手表无法打开锁屏授权设置"); }
    }

    /** Cancellation is checked explicitly, even if an old administration permission exists. */
    public static boolean handleResult(Activity activity, int requestCode, int resultCode) {
        if (requestCode != REQUEST_DEVICE_ADMIN) return false;
        if (resultCode == Activity.RESULT_OK && isAdminActive(activity)) lock(activity);
        return true;
    }

    private static void lock(Activity activity) {
        try {
            DevicePolicyManager policy = manager(activity);
            if (policy == null || !policy.isAdminActive(component(activity))) {
                toast(activity, "需要先允许锁屏功能"); return;
            }
            policy.lockNow();
        } catch (RuntimeException denied) { toast(activity, "锁屏未成功，录音仍保持原状态"); }
    }

    /** Requests removal of this app's administrator only; system completion may be asynchronous. */
    public static boolean revokeLockPermission(Context context) {
        try {
            DevicePolicyManager policy = manager(context);
            if (policy == null) return false;
            if (policy.isAdminActive(component(context))) policy.removeActiveAdmin(component(context));
            return true;
        } catch (RuntimeException denied) { return false; }
    }

    private static void toast(Context context, String text) {
        Toast.makeText(context, text, Toast.LENGTH_LONG).show();
    }
}
