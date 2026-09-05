const FACEBOOK_SDK_ID =
  'facebook-jssdk';

const FACEBOOK_SDK_URL =
  'https://connect.facebook.net/en_US/sdk.js';

const SIGNUP_TIMEOUT_MS =
  10 * 60 * 1000;


// ======================================================
// TRUST META POSTMESSAGE ORIGIN
// ======================================================

function isTrustedFacebookOrigin(
  origin,
) {
  try {
    const url =
      new URL(origin);

    if (
      url.protocol !== 'https:'
    ) {
      return false;
    }

    return (
      url.hostname ===
        'facebook.com' ||
      url.hostname.endsWith(
        '.facebook.com',
      )
    );
  } catch {
    return false;
  }
}


// ======================================================
// LOAD FACEBOOK JAVASCRIPT SDK
// ======================================================

export function loadFacebookSdk({
  appId,
  graphVersion,
}) {
  if (!appId) {
    return Promise.reject(
      new Error(
        'Meta App ID is required.',
      ),
    );
  }

  if (!graphVersion) {
    return Promise.reject(
      new Error(
        'Meta Graph API version is required.',
      ),
    );
  }


  return new Promise(
    (resolve, reject) => {

      // -----------------------------------------------
      // SDK ALREADY INITIALIZED
      // -----------------------------------------------

      if (window.FB) {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: false,
          version:
            graphVersion,
        });

        resolve(
          window.FB,
        );

        return;
      }


      const previousInit =
        window.fbAsyncInit;


      window.fbAsyncInit =
        function facebookSdkReady() {
          try {
            if (
              typeof previousInit ===
              'function'
            ) {
              previousInit();
            }

            window.FB.init({
              appId,
              cookie: true,
              xfbml: false,
              version:
                graphVersion,
            });

            resolve(
              window.FB,
            );
          } catch (error) {
            reject(
              error,
            );
          }
        };


      // -----------------------------------------------
      // SCRIPT ALREADY EXISTS
      // -----------------------------------------------

      const existingScript =
        document.getElementById(
          FACEBOOK_SDK_ID,
        );

      if (existingScript) {
        existingScript.addEventListener(
          'error',
          () => {
            reject(
              new Error(
                'Meta Facebook SDK could not be loaded.',
              ),
            );
          },
          {
            once: true,
          },
        );

        return;
      }


      // -----------------------------------------------
      // ADD SDK SCRIPT
      // -----------------------------------------------

      const script =
        document.createElement(
          'script',
        );

      script.id =
        FACEBOOK_SDK_ID;

      script.src =
        FACEBOOK_SDK_URL;

      script.async =
        true;

      script.defer =
        true;

      script.crossOrigin =
        'anonymous';


      script.onerror =
        () => {
          reject(
            new Error(
              'Meta Facebook SDK could not be loaded.',
            ),
          );
        };


      document.body.appendChild(
        script,
      );
    },
  );
}


// ======================================================
// LAUNCH WHATSAPP EMBEDDED SIGNUP
// ======================================================
//
// IMPORTANT:
//
// This function calls FB.login immediately.
//
// Do not add an `await` before FB.login inside this
// function because browsers can block the popup if it
// is no longer considered part of the button click.
// ======================================================

export function launchWhatsAppEmbeddedSignup({
  configurationId,
}) {
  if (!window.FB) {
    return Promise.reject(
      new Error(
        'Meta Facebook SDK is not ready.',
      ),
    );
  }


  if (!configurationId) {
    return Promise.reject(
      new Error(
        'WhatsApp Embedded Signup configuration ID is missing.',
      ),
    );
  }


  return new Promise(
    (resolve, reject) => {
      let authorizationCode =
        null;

      let wabaId =
        null;

      let phoneNumberId =
        null;

      let completed =
        false;


      // -----------------------------------------------
      // CLEANUP
      // -----------------------------------------------

      let timeoutId =
        null;


      function cleanup() {
        window.removeEventListener(
          'message',
          sessionInfoListener,
        );

        if (timeoutId) {
          window.clearTimeout(
            timeoutId,
          );
        }
      }


      function fail(
        error,
      ) {
        if (completed) {
          return;
        }

        completed =
          true;

        cleanup();

        reject(
          error instanceof Error
            ? error
            : new Error(
                String(error),
              ),
        );
      }


      function tryComplete() {
        if (completed) {
          return;
        }

        /*
         * Meta returns the authorization code through
         * FB.login(), while WABA / phone IDs arrive through
         * the WA_EMBEDDED_SIGNUP postMessage event.
         *
         * They can arrive in either order.
         */

        if (
          !authorizationCode ||
          !wabaId ||
          !phoneNumberId
        ) {
          return;
        }


        completed =
          true;

        cleanup();


        resolve({
          code:
            authorizationCode,

          wabaId,

          phoneNumberId,
        });
      }


      // -----------------------------------------------
      // EMBEDDED SIGNUP SESSION EVENT
      // -----------------------------------------------

      function sessionInfoListener(
        event,
      ) {
        if (
          !isTrustedFacebookOrigin(
            event.origin,
          )
        ) {
          return;
        }


        if (
          typeof event.data !==
          'string'
        ) {
          return;
        }


        let data;

        try {
          data =
            JSON.parse(
              event.data,
            );
        } catch {
          /*
           * Facebook also emits non-JSON OAuth messages.
           * They are unrelated to WA_EMBEDDED_SIGNUP.
           */
          return;
        }


        if (
          data?.type !==
          'WA_EMBEDDED_SIGNUP'
        ) {
          return;
        }


        // ---------------------------------------------
        // FINISHED
        // ---------------------------------------------

        if (
          data.event ===
          'FINISH'
        ) {
          wabaId =
            String(
              data.data
                ?.waba_id ??
              '',
            ).trim() ||
            null;

          phoneNumberId =
            String(
              data.data
                ?.phone_number_id ??
              '',
            ).trim() ||
            null;


          if (!wabaId) {
            fail(
              new Error(
                'Meta completed WhatsApp signup but did not return a WABA ID.',
              ),
            );

            return;
          }


          if (
            !phoneNumberId
          ) {
            fail(
              new Error(
                'Meta completed WhatsApp signup but did not return a phone number ID.',
              ),
            );

            return;
          }


          tryComplete();

          return;
        }


        // ---------------------------------------------
        // CANCELLED
        // ---------------------------------------------

        if (
          data.event ===
          'CANCEL'
        ) {
          const step =
            data.data
              ?.current_step;

          fail(
            new Error(
              step
                ? `WhatsApp signup was cancelled at ${step}.`
                : 'WhatsApp signup was cancelled.',
            ),
          );

          return;
        }


        // ---------------------------------------------
        // META ERROR
        // ---------------------------------------------

        if (
          data.event ===
          'ERROR'
        ) {
          fail(
            new Error(
              data.data
                ?.error_message ||
              'Meta could not complete WhatsApp Embedded Signup.',
            ),
          );
        }
      }


      window.addEventListener(
        'message',
        sessionInfoListener,
      );


      timeoutId =
        window.setTimeout(
          () => {
            fail(
              new Error(
                'WhatsApp Embedded Signup timed out. Please try again.',
              ),
            );
          },
          SIGNUP_TIMEOUT_MS,
        );


      // -----------------------------------------------
      // IMPORTANT:
      // FB.login is invoked synchronously here.
      // -----------------------------------------------

      window.FB.login(
        (response) => {
          const code =
            response
              ?.authResponse
              ?.code;

          if (!code) {
            fail(
              new Error(
                'WhatsApp authorization was cancelled or no authorization code was returned.',
              ),
            );

            return;
          }


          authorizationCode =
            String(
              code,
            ).trim();


          tryComplete();
        },
        {
          config_id:
            configurationId,

          response_type:
            'code',

          override_default_response_type:
            true,

          extras: {
            setup: {},
          },
        },
      );
    },
  );
}