package com.margelo.nitro.com.nitromarkdown

import androidx.annotation.GuardedBy

class HybridMarkdownSession : HybridMarkdownSessionSpec() {
    @GuardedBy("lock")
    private var buffer = StringBuilder()

    @GuardedBy("lock")
    private val listeners = mutableMapOf<Long, (Double, Double) -> Unit>()

    @GuardedBy("lock")
    private var nextListenerId = 0L

    private val lock = Any()

    @Volatile
    private var isDestroyed = false

    // H4: synchronized getter and setter for highlightPosition
    @GuardedBy("lock")
    override var highlightPosition: Double = 0.0
        get() = synchronized(lock) { field }
        set(value) = synchronized(lock) { field = value }
        // No notify for highlighting to avoid flood

    override val memorySize: Long
        get() = synchronized(lock) { buffer.length.toLong() }

    override fun append(chunk: String): Double {
        val from: Int
        val to: Int
        synchronized(lock) {
            // H5: guard against OOM by limiting buffer size
            if (buffer.length + chunk.length > MAX_BUFFER_SIZE) {
                throw IllegalArgumentException("Buffer size limit exceeded (max ${MAX_BUFFER_SIZE} chars)")
            }
            from = buffer.length
            buffer.append(chunk)
            to = buffer.length
        }
        notifyListeners(from.toDouble(), to.toDouble())
        return to.toDouble()
    }

    override fun clear() {
        synchronized(lock) {
            buffer.clear()
            highlightPosition = 0.0
        }
        notifyListeners(0.0, 0.0)
    }

    override fun getAllText(): String {
        synchronized(lock) {
            return buffer.toString()
        }
    }

    override fun getLength(): Double {
        synchronized(lock) {
            return buffer.length.toDouble()
        }
    }

    override fun getTextRange(from: Double, to: Double): String {
        // M4: safe Double → Int coercion via Long to avoid precision issues
        if (from.isNaN() || from < 0.0) return ""
        synchronized(lock) {
            val start = from.toLong().coerceIn(0L, buffer.length.toLong()).toInt()
            val end = to.toLong().coerceIn(start.toLong(), buffer.length.toLong()).toInt()
            return buffer.substring(start, end)
        }
    }

    override fun addListener(listener: (Double, Double) -> Unit): () -> Unit {
        // L6: guard against adding listeners to a destroyed session
        if (isDestroyed) throw IllegalStateException("HybridMarkdownSession is destroyed")
        val id: Long
        synchronized(lock) {
            id = nextListenerId++
            listeners[id] = listener
        }
        return {
            synchronized(lock) {
                listeners.remove(id)
            }
        }
    }

    override fun reset(text: String) {
        synchronized(lock) {
            buffer.replace(0, buffer.length, text)
        }
        notifyListeners(0.0, text.length.toDouble())
    }

    override fun replace(from: Double, to: Double, text: String): Double {
        // M3: validate range before proceeding
        require(from >= 0.0 && to >= from) { "Invalid range: from=$from must be >= 0 and to=$to must be >= from" }
        val newLength: Double
        synchronized(lock) {
            // M4: safe Double → Int coercion via Long to avoid precision issues
            val start = from.toLong().coerceIn(0L, buffer.length.toLong()).toInt()
            val end = to.toLong().coerceIn(start.toLong(), buffer.length.toLong()).toInt()
            buffer.replace(start, end, text)
            newLength = buffer.length.toDouble()
        }
        notifyListeners(from, from + text.length.toDouble())
        return newLength
    }

    // H3: try-catch per listener so one failing callback doesn't stop the rest
    private fun notifyListeners(from: Double, to: Double) {
        val snapshot: List<(Double, Double) -> Unit>
        synchronized(lock) {
            snapshot = listeners.values.toList()
        }
        for (listener in snapshot) {
            try {
                listener(from, to)
            } catch (e: Throwable) {
                android.util.Log.e(TAG, "Listener callback threw an exception", e)
            }
        }
    }

    // H5: lifecycle cleanup — clears all listeners and marks the session as destroyed.
    // Called explicitly when the session is no longer needed (e.g. from JS via a destroy method).
    fun onDestroyed() {
        synchronized(lock) {
            isDestroyed = true
            listeners.clear()
        }
    }

    // H5: HybridMarkdownSessionSpec (and its base HybridObject) provides no explicit destroy() /
    // dispose() lifecycle hook that the Nitro framework calls for us. finalize() is the only JVM
    // safety-net available without explicit resource management. It is deprecated in Java 9+ but
    // still functional on Android. This ensures listeners are always cleared even if the caller
    // never explicitly disposes the session.
    @Suppress("deprecation")
    override fun finalize() {
        try {
            onDestroyed()
        } finally {
            super.finalize()
        }
    }

    // H6: The C++ generated file (JHybridMarkdownSessionSpec.cpp) is marked DO NOT MODIFY and
    // cannot be edited. However, fbjni (used by Nitro) automatically propagates Java/Kotlin
    // exceptions thrown across the JNI boundary as C++ exceptions. Therefore, an
    // IllegalArgumentException thrown in append() will be rethrown on the C++ side without
    // requiring manual JNI exception checks in the generated code.

    companion object {
        private const val TAG = "HybridMarkdownSession"
        private const val MAX_BUFFER_SIZE = 10 * 1024 * 1024 // 10 MB
    }
}
