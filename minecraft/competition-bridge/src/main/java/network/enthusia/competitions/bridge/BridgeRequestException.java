package network.enthusia.competitions.bridge;

final class BridgeRequestException extends Exception {
    private final int status;
    private final String code;

    BridgeRequestException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    int status() { return status; }
    String code() { return code; }
}
