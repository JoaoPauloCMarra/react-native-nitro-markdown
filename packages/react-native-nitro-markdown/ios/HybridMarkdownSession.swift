import Foundation
import NitroModules

class HybridMarkdownSession: HybridMarkdownSessionSpec {
    private static let maxBufferSize = 10 * 1024 * 1024

    private var buffer = ""
    private var listeners: [UUID: (Double, Double) -> Void] = [:]
    private var isDisposed = false
    private let lock = NSLock()

    var highlightPosition: Double {
        get {
            lock.lock()
            defer { lock.unlock() }
            if isDisposed { return 0 }
            return _highlightPosition
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            if isDisposed { return }
            _highlightPosition = newValue
        }
    }
    private var _highlightPosition: Double = 0

    var memorySize: Int {
        lock.lock()
        defer { lock.unlock() }
        return buffer.utf8.count
            + MemoryLayout<HybridMarkdownSession>.size
            + MemoryLayout<NSLock>.size
            + listeners.count * 128  // UUID key (16 bytes) + closure overhead estimate
    }

    deinit {
        releaseStorage()
    }

    func dispose() {
        releaseStorage()
    }

    private func releaseStorage() {
        lock.lock()
        defer { lock.unlock() }
        listeners.removeAll()
        buffer = ""
        _highlightPosition = 0
        isDisposed = true
    }

    private func utf16Length(_ value: String) -> Int {
        return (value as NSString).length
    }

    private func validateBufferSize(_ size: Int) throws {
        if size > Self.maxBufferSize {
            throw NSError(
                domain: "NitroMarkdown",
                code: 1,
                userInfo: [
                    NSLocalizedDescriptionKey: "Buffer size limit exceeded (max \(Self.maxBufferSize) chars)"
                ]
            )
        }
    }

    func append(chunk: String) throws -> Double {
        let notifyFrom: Double
        let notifyTo: Double
        do {
            lock.lock()
            defer { lock.unlock() }
            try validateActiveLocked()
            let fromInt = utf16Length(buffer)
            try validateBufferSize(fromInt + utf16Length(chunk))
            buffer += chunk
            let toInt = utf16Length(buffer)
            notifyFrom = Double(fromInt)
            notifyTo = Double(toInt)
        }
        notifyListeners(from: notifyFrom, to: notifyTo)
        return notifyTo
    }

    func clear() throws {
        do {
            lock.lock()
            defer { lock.unlock() }
            try validateActiveLocked()
            buffer = ""
            _highlightPosition = 0
        }
        notifyListeners(from: 0, to: 0)
    }

    func getAllText() throws -> String {
        lock.lock()
        defer { lock.unlock() }
        try validateActiveLocked()
        return buffer
    }

    func getLength() throws -> Double {
        lock.lock()
        defer { lock.unlock() }
        try validateActiveLocked()
        return Double(utf16Length(buffer))
    }

    func getTextRange(from: Double, to: Double) throws -> String {
        guard from.isFinite && to.isFinite && from >= 0 && to >= 0 && from <= to else {
            return ""
        }
        lock.lock()
        defer { lock.unlock() }
        try validateActiveLocked()

        let text = buffer as NSString
        let length = text.length
        let start = max(0, min(Int(from), length))
        let end = max(start, min(Int(to), length))
        return text.substring(with: NSRange(location: start, length: end - start))
    }

    /// Adds a change listener. The listener closure is held strongly.
    /// To avoid retain cycles, ensure the listener does not capture a strong
    /// reference to the object that owns this HybridMarkdownSession.
    /// Always call the returned cleanup closure when done to unregister.
    func addListener(listener: @escaping (Double, Double) -> Void) throws -> () -> Void {
        let id = UUID()
        lock.lock()
        defer { lock.unlock() }
        try validateActiveLocked()
        listeners[id] = listener

        return { [weak self] in
            guard let self else { return }
            self.lock.lock()
            defer { self.lock.unlock() }
            self.listeners.removeValue(forKey: id)
        }
    }

    func reset(text: String) throws -> Void {
        let notifyTo: Double
        do {
            lock.lock()
            defer { lock.unlock() }
            try validateActiveLocked()
            try validateBufferSize(utf16Length(text))
            buffer = text
            _highlightPosition = 0
            notifyTo = Double((text as NSString).length)
        }
        notifyListeners(from: 0, to: notifyTo)
    }

    func replace(from: Double, to: Double, text: String) throws -> Double {
        let notifyFrom: Double
        let notifyTo: Double
        let newLength: Double
        let start: Int
        let end: Int
        do {
            lock.lock()
            defer { lock.unlock() }
            try validateActiveLocked()
            guard from.isFinite && to.isFinite && from >= 0 && to >= 0 && from <= to else {
                throw NSError(
                    domain: "NitroMarkdown",
                    code: 2,
                    userInfo: [
                        NSLocalizedDescriptionKey: "Invalid range: from=\(from) and to=\(to) must be finite, from must be >= 0, and to must be >= from"
                    ]
                )
            }
            let nsBuffer = NSMutableString(string: buffer)
            let length = nsBuffer.length
            start = max(0, min(Int(from), length))
            end = max(start, min(Int(to), length))
            try validateBufferSize(length - (end - start) + utf16Length(text))
            nsBuffer.replaceCharacters(in: NSRange(location: start, length: end - start), with: text)
            buffer = nsBuffer as String
            newLength = Double((buffer as NSString).length)
            notifyFrom = Double(start)
            notifyTo = Double(start + utf16Length(text))
        }
        notifyListeners(from: notifyFrom, to: notifyTo)
        return newLength
    }

    private func validateActiveLocked() throws {
        if isDisposed {
            throw NSError(
                domain: "NitroMarkdown",
                code: 3,
                userInfo: [
                    NSLocalizedDescriptionKey: "HybridMarkdownSession is destroyed"
                ]
            )
        }
    }

    /// Notifies all registered listeners about a buffer change.
    /// Called OUTSIDE the lock to prevent deadlock (listeners may call back into this session).
    /// The `from`/`to` values reflect the buffer state AT THE TIME OF MUTATION.
    /// The buffer may have been further modified by the time listener callbacks execute.
    /// Listeners MUST NOT assume the buffer is stable; they should only use the index parameters.
    private func notifyListeners(from: Double, to: Double) {
        lock.lock()
        let currentListeners = Array(listeners.values)
        lock.unlock()

        for listener in currentListeners {
            listener(from, to)
        }
    }
}
