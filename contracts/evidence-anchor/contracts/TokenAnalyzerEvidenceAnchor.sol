// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Immutable records for cryptographic TokenAnalyzer evidence snapshots.
/// @dev The complete snapshot is deliberately kept off-chain; this contract stores only its hash and minimal provenance.
contract TokenAnalyzerEvidenceAnchor {
    error Unauthorized();
    error ZeroAddress();
    error ZeroEvidenceHash();
    error ZeroAssetKey();
    error ZeroSchemaVersion();
    error EvidenceAlreadyAnchored(bytes32 evidenceHash);

    struct EvidenceRecord {
        bytes32 assetKey;
        uint32 schemaVersion;
        uint64 anchoredAt;
        address attestor;
    }

    address public owner;
    address public attestor;
    mapping(bytes32 evidenceHash => EvidenceRecord record) private records;

    event EvidenceAnchored(
        bytes32 indexed evidenceHash,
        bytes32 indexed assetKey,
        uint32 schemaVersion,
        address indexed attestor,
        uint64 anchoredAt
    );
    event AttestorUpdated(address indexed previousAttestor, address indexed newAttestor);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialAttestor) {
        if (initialAttestor == address(0)) revert ZeroAddress();
        owner = msg.sender;
        attestor = initialAttestor;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AttestorUpdated(address(0), initialAttestor);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setAttestor(address newAttestor) external onlyOwner {
        if (newAttestor == address(0)) revert ZeroAddress();
        emit AttestorUpdated(attestor, newAttestor);
        attestor = newAttestor;
    }

    function anchorEvidence(bytes32 evidenceHash, bytes32 assetKey, uint32 schemaVersion) external onlyAttestor {
        if (evidenceHash == bytes32(0)) revert ZeroEvidenceHash();
        if (assetKey == bytes32(0)) revert ZeroAssetKey();
        if (schemaVersion == 0) revert ZeroSchemaVersion();
        if (records[evidenceHash].anchoredAt != 0) revert EvidenceAlreadyAnchored(evidenceHash);

        uint64 anchoredAt = uint64(block.timestamp);
        records[evidenceHash] = EvidenceRecord({ assetKey: assetKey, schemaVersion: schemaVersion, anchoredAt: anchoredAt, attestor: msg.sender });
        emit EvidenceAnchored(evidenceHash, assetKey, schemaVersion, msg.sender, anchoredAt);
    }

    function isAnchored(bytes32 evidenceHash) external view returns (bool) {
        return records[evidenceHash].anchoredAt != 0;
    }

    function getEvidence(bytes32 evidenceHash) external view returns (bytes32 assetKey, uint32 schemaVersion, uint64 anchoredAt, address recordAttestor, bool anchored) {
        EvidenceRecord memory record = records[evidenceHash];
        return (record.assetKey, record.schemaVersion, record.anchoredAt, record.attestor, record.anchoredAt != 0);
    }
}
