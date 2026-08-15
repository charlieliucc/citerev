import Foundation

struct RuleProfileSummary: Codable, Identifiable, Hashable {
    let schemaVersion: Int
    let id: String
    let name: String
    let version: String?
    let baseStyle: String?
    let description: String?
    let ruleType: String?

    var isIndependentStyle: Bool { ruleType == "independent" }
}

enum RuleProfileStore {
    static let activePreferenceKey = "activeCitationRuleProfile"

    static func availableProfiles() -> [RuleProfileSummary] {
        var profiles: [RuleProfileSummary] = []
        if let builtIn = try? readSummary(at: AppResources.file(in: "engine", named: "rules-apa7.json")) {
            profiles.append(builtIn)
        }
        if let urls = try? FileManager.default.contentsOfDirectory(
            at: userDirectory(create: false),
            includingPropertiesForKeys: nil
        ) {
            for url in urls where url.pathExtension.lowercased() == "json" {
                if let profile = try? readSummary(at: url), profile.id != "apa7" {
                    profiles.removeAll { $0.id == profile.id }
                    profiles.append(profile)
                }
            }
        }
        return profiles.sorted { lhs, rhs in
            if lhs.id == "apa7" { return true }
            if rhs.id == "apa7" { return false }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    static func profileData(activeID: String) throws -> [(URL, Data)] {
        var result: [(URL, Data)] = []
        let builtInURL = AppResources.file(in: "engine", named: "rules-apa7.json")
        result.append((builtInURL, try validatedData(at: builtInURL)))
        for profile in availableProfiles() where profile.id != "apa7" {
            let url = userDirectory(create: false).appendingPathComponent(profile.id).appendingPathExtension("json")
            if FileManager.default.fileExists(atPath: url.path) {
                result.append((url, try validatedData(at: url)))
            }
        }
        guard availableProfiles().contains(where: { $0.id == activeID }) else {
            throw ProfileError.activeProfileMissing(activeID)
        }
        return result
    }

    @discardableResult
    static func importProfile(from source: URL) throws -> RuleProfileSummary {
        let data = try validatedData(at: source)
        let profile = try JSONDecoder().decode(RuleProfileSummary.self, from: data)
        guard profile.id != "apa7" else { throw ProfileError.reservedID }
        guard profile.isIndependentStyle || profile.baseStyle == "apa7" else { throw ProfileError.unsupportedBase }
        let destination = userDirectory(create: true)
            .appendingPathComponent(profile.id)
            .appendingPathExtension("json")
        try data.write(to: destination, options: .atomic)
        return profile
    }

    private static func readSummary(at url: URL) throws -> RuleProfileSummary {
        return try JSONDecoder().decode(RuleProfileSummary.self, from: validatedData(at: url))
    }

    private static func validatedData(at url: URL) throws -> Data {
        let data = try Data(contentsOf: url)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = object as? [String: Any],
              dictionary["schemaVersion"] as? Int == 1,
              let id = dictionary["id"] as? String,
              id.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]*$", options: .regularExpression) != nil,
              let name = dictionary["name"] as? String, !name.isEmpty,
              dictionary["config"] == nil || dictionary["config"] is [String: Any] else {
            throw ProfileError.invalidSchema
        }
        let isIndependent = dictionary["ruleType"] as? String == "independent"
        if id == "apa7" {
            guard dictionary["baseStyle"] == nil, !isIndependent else { throw ProfileError.unsupportedBase }
        } else if isIndependent {
            guard dictionary["baseStyle"] == nil,
                  dictionary["rules"] is [String: Any],
                  dictionary["config"] is [String: Any] else { throw ProfileError.invalidSchema }
        } else {
            guard dictionary["baseStyle"] as? String == "apa7" else { throw ProfileError.unsupportedBase }
        }
        return data
    }

    private static func userDirectory(create: Bool) -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("CitationReviewer", isDirectory: true)
            .appendingPathComponent("Rules", isDirectory: true)
        if create { try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true) }
        return url
    }

    enum ProfileError: LocalizedError {
        case invalidSchema, reservedID, unsupportedBase, activeProfileMissing(String)
        var errorDescription: String? {
            switch self {
            case .invalidSchema: return "规则 JSON 格式无效：需要 schemaVersion、id、name 和 config。"
            case .reservedID: return "apa7 是内置规则 ID，不能被用户规则覆盖。"
            case .unsupportedBase: return "APA 参数覆盖须使用 baseStyle: apa7；其他体系须使用不含 baseStyle 的 independent JSON 规则。"
            case .activeProfileMissing(let id): return "找不到已选择的规则：\(id)"
            }
        }
    }
}
