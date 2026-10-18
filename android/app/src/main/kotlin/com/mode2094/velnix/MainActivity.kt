package com.mode2094.velnix

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureOrderUpdatesChannel()
    }

    /**
     * Creates the channel named by the manifest default and by the backend
     * payload. Without it FCM falls back to an unnamed "Miscellaneous" channel
     * that the employee cannot tune or silence separately.
     */
    private fun ensureOrderUpdatesChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel =
            NotificationChannel(
                ORDER_UPDATES_CHANNEL_ID,
                getString(R.string.velnix_order_updates_channel),
                NotificationManager.IMPORTANCE_DEFAULT,
            )
        channel.description = getString(R.string.velnix_order_updates_channel_description)
        manager.createNotificationChannel(channel)
    }

    private companion object {
        const val ORDER_UPDATES_CHANNEL_ID = "velnix_order_updates"
    }
}
