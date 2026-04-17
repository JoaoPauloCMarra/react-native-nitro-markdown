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
        if (!from.isFinite() || !to.isFinite() || from < 0.0 || to < 0.0 || from > to) return ""
        synchronized(lock) {
            val start = from.toLong().coerceIn(0L, buffer.length.toLong()).toInt()
            val end = to.toLong().coerceIn(start.toLong(), buffer.length.toLong()).toInt()
            return buffer.substring(start, end)
        }
    }

    override fun addListener(listener: (Double, Double) -> Unit): () -> Unit {
        synchronized(lock) {
            if (isDestroyed) throw IllegalStateException("HybridMarkdownSession is destroyed")
            val id = nextListenerId++
            listeners[id] = listener
            return { synchronized(lock) { listeners.remove(id) } }
        }
    }

    override fun reset(text: String) {
        synchronized(lock) {
            buffer.replace(0, buffer.length, text)
            highlightPosition = 0.0
        }
        notifyListeners(0.0, text.length.toDouble())
    }

    override fun replace(from: Double, to: Double, text: String): Double {
        require(from.isFinite() && to.isFinite() && from >= 0.0 && to >= 0.0 && to >= from) {
            "Invalid range: from=$from and to=$to must be finite, from must be >= 0, and to must be >= from"
        }
        val newLength: Double
        val notifyFrom: Double
        val notifyTo: Double
        synchronized(lock) {
            val start = from.toLong().coerceIn(0L, buffer.length.toLong()).toInt()
            val end = to.toLong().coerceIn(start.toLong(), buffer.length.toLong()).toInt()
            buffer.replace(start, end, text)
            newLength = buffer.length.toDouble()
            notifyFrom = start.toDouble()
            notifyTo = start.toDouble() + text.length.toDouble()
        }
        notifyListeners(notifyFrom, notifyTo)
        return newLength
    }

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

    fun onDestroyed() {
        synchronized(lock) {
            isDestroyed = true
            listeners.clear()
        }
    }

    override fun dispose() {
        onDestroyed()
        super.dispose()
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
