package network.enthusia.competitions.bridge;

final class BridgeRequestException extends Exception {
    private static final long serialVersionUID = 1L;

    private final int httpStatus;
    private final String errorCode;

    BridgeRequestException(int httpStatus, String errorCode, String message) {
        super(message);
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
    }

    int status() { return httpStatus; }
    String code() { return errorCode; }
}
