package com.margelo.nitro.com.nitromarkdown

class HybridMarkdownSession : HybridMarkdownSessionSpec() {
    private var buffer = StringBuilder()
    private val listeners = mutableMapOf<Long, (Double, Double) -> Unit>()
    private var nextListenerId = 0L
    private val lock = Any()

    override var highlightPosition: Double = 0.0
        set(value) {
            synchronized(lock) { field = value }
            // No notify for highlighting to avoid flood
        }



    override val memorySize: Long
        get() = buffer.length.toLong()

    override fun append(chunk: String): Double {
        val from: Int
        val to: Int
        synchronized(lock) {
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
        synchronized(lock) {
            val start = from.toInt().coerceIn(0, buffer.length)
            val end = to.toInt().coerceIn(start, buffer.length)
            return buffer.substring(start, end)
        }
    }

    override fun addListener(listener: (Double, Double) -> Unit): () -> Unit {
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
        val newLength: Double
        synchronized(lock) {
            val start = from.toInt().coerceIn(0, buffer.length)
            val end = to.toInt().coerceIn(start, buffer.length)
            buffer.replace(start, end, text)
            newLength = buffer.length.toDouble()
        }
        notifyListeners(from, from + text.length.toDouble())
        return newLength
    }

    private fun notifyListeners(from: Double, to: Double) {
        val currentListeners: Collection<(Double, Double) -> Unit>
        synchronized(lock) {
            currentListeners = listeners.values.toList()
        }
        currentListeners.forEach { it(from, to) }
    }
}
