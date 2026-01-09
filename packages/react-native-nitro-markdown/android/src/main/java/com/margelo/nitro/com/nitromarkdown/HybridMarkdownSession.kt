package com.margelo.nitro.com.nitromarkdown

class HybridMarkdownSession : HybridMarkdownSessionSpec() {
    private var buffer = StringBuilder()
    private val listeners = mutableMapOf<Long, () -> Unit>()
    private var nextListenerId = 0L
    private val lock = Any()

    override var highlightPosition: Double = 0.0
        set(value) {
            synchronized(lock) { field = value }
            // No notify for highlighting to avoid flood
        }



    override val memorySize: Long
        get() = buffer.length.toLong()

    override fun append(chunk: String) {
        synchronized(lock) {
            buffer.append(chunk)
        }
        notifyListeners()
    }

    override fun clear() {
        synchronized(lock) {
            buffer.clear()
            highlightPosition = 0.0
        }
        notifyListeners()
    }

    override fun getAllText(): String {
        synchronized(lock) {
            return buffer.toString()
        }
    }

    override fun addListener(listener: () -> Unit): () -> Unit {
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

    private fun notifyListeners() {
        val currentListeners: Collection<() -> Unit>
        synchronized(lock) {
            currentListeners = listeners.values.toList()
        }
        currentListeners.forEach { it() }
    }
}
