//
//  SafariWebExtensionHandler.swift
//  Grab OTP Extension
//
//  Created by Jeff Schumann on 5/11/26.
//

import AuthenticationServices
import os.log
import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling, ASWebAuthenticationPresentationContextProviding {

    private var currentAuthSession: ASWebAuthenticationSession?
    private var presentationWindow: ASPresentationAnchor?

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        handleNativeMessage(message, context: context)
    }

    private func handleNativeMessage(_ message: Any?, context: NSExtensionContext) {
        guard let message = message as? [String: Any],
              let action = message["action"] as? String else {
            complete(context, with: [
                "success": false,
                "error": "Safari native OAuth received an unsupported message."
            ])
            return
        }

        switch action {
        case "beginGmailOAuth":
            beginGmailOAuth(message, context: context)
        default:
            complete(context, with: [
                "success": false,
                "error": "Unsupported Safari native action: \(action)"
            ])
        }
    }

    private func beginGmailOAuth(_ message: [String: Any], context: NSExtensionContext) {
        guard currentAuthSession == nil else {
            complete(context, with: [
                "success": false,
                "error": "A Safari Gmail OAuth session is already in progress."
            ])
            return
        }

        guard let authUrlString = message["authUrl"] as? String,
              let authUrl = URL(string: authUrlString),
              let callbackScheme = message["callbackScheme"] as? String,
              !callbackScheme.isEmpty else {
            complete(context, with: [
                "success": false,
                "error": "Safari native OAuth received an invalid auth URL or callback scheme."
            ])
            return
        }

        os_log(.default, "Starting Safari Gmail OAuth with callback scheme: %@", callbackScheme)

        let session = ASWebAuthenticationSession(url: authUrl, callbackURLScheme: callbackScheme) { [weak self] callbackUrl, error in
            guard let self = self else { return }

            defer {
                self.currentAuthSession = nil
                self.presentationWindow = nil
            }

            if let error = error {
                self.complete(context, with: [
                    "success": false,
                    "error": "Safari native OAuth failed: \(error.localizedDescription)"
                ])
                return
            }

            guard let callbackUrl = callbackUrl else {
                self.complete(context, with: [
                    "success": false,
                    "error": "Safari native OAuth completed without a callback URL."
                ])
                return
            }

            self.complete(context, with: [
                "success": true,
                "callbackUrl": callbackUrl.absoluteString
            ])
        }

        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        currentAuthSession = session

        if !session.start() {
            currentAuthSession = nil
            presentationWindow = nil
            complete(context, with: [
                "success": false,
                "error": "Safari native OAuth could not start ASWebAuthenticationSession."
            ])
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let presentationWindow = presentationWindow {
            return presentationWindow
        }

        let window = ASPresentationAnchor()
        presentationWindow = window
        return window
    }

    private func complete(_ context: NSExtensionContext, with payload: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: payload ]
        } else {
            response.userInfo = [ "message": payload ]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}
