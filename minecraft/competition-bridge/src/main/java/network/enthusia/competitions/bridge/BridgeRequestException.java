package network.enthusia.competitions.bridge;

final class BridgeRequestException extends Exception {
    private static final long serialVersionUID = 1L;

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
