import Foundation
import NitroModules

class HybridMarkdownSession: HybridMarkdownSessionSpec {
    private var buffer = ""
    private var listeners: [UUID: (Double, Double) -> Void] = [:]
    private let lock = NSLock()

    var highlightPosition: Double {
        get { lock.lock(); defer { lock.unlock() }; return _highlightPosition }
        set { lock.lock(); defer { lock.unlock() }; _highlightPosition = newValue }
    }
    private var _highlightPosition: Double = 0

    var memorySize: Int {
        return buffer.utf8.count
            + MemoryLayout<HybridMarkdownSession>.size
            + MemoryLayout<NSLock>.size
            + listeners.count * 128  // UUID key (16 bytes) + closure overhead estimate
    }

    private func utf16Length(_ value: String) -> Int {
        return (value as NSString).length
    }

    func append(chunk: String) throws -> Double {
        let notifyFrom: Double
        let notifyTo: Double
        do {
            lock.lock()
            defer { lock.unlock() }
            let fromInt = utf16Length(buffer)
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
            buffer = ""
            _highlightPosition = 0
        }
        notifyListeners(from: 0, to: 0)
    }

    func getAllText() throws -> String {
        lock.lock()
        defer { lock.unlock() }
        return buffer
    }

    func getLength() throws -> Double {
        lock.lock()
        defer { lock.unlock() }
        return Double(utf16Length(buffer))
    }

    func getTextRange(from: Double, to: Double) throws -> String {
        guard from.isFinite && to.isFinite && from >= 0 && to >= 0 && from <= to else {
            return ""
        }
        lock.lock()
        defer { lock.unlock() }

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
        listeners[id] = listener
        lock.unlock()

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
            guard from.isFinite && to.isFinite && from >= 0 && to >= 0 && from <= to else {
                return Double(utf16Length(buffer))
            }
            let nsBuffer = NSMutableString(string: buffer)
            let length = nsBuffer.length
            start = max(0, min(Int(from), length))
            end = max(start, min(Int(to), length))
            nsBuffer.replaceCharacters(in: NSRange(location: start, length: end - start), with: text)
            buffer = nsBuffer as String
            newLength = Double((buffer as NSString).length)
            notifyFrom = from
            notifyTo = from + Double((text as NSString).length)
        }
        if start == end && text.isEmpty {
            return newLength
        }
        notifyListeners(from: notifyFrom, to: notifyTo)
        return newLength
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
