# Administration operations

Administration commands use the Firebase Admin SDK and can change production authorization. Run them only from a trusted workstation and verify the Firebase project before making a change.

## Credential boundary

Credential files must not be stored anywhere inside this repository, including ignored directories. The administration commands enforce this by resolving `GOOGLE_APPLICATION_CREDENTIALS` and refusing paths inside the repository tree.

The commands use Google Application Default Credentials (ADC), following the Firebase Admin SDK setup guidance. For this local Firebase Authentication operation, the most direct option is an externally stored service-account key supplied through `GOOGLE_APPLICATION_CREDENTIALS`.

Example PowerShell setup:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\your-name\.config\game-x\credentials\firebase-admin.json"
$env:GOOGLE_CLOUD_PROJECT = "your-firebase-project-id"
```

Do not put either value in `.env`, source files, shell scripts, screenshots, issue reports, or committed documentation. The environment variables apply only to the current PowerShell session.

Google Cloud user ADC created by `gcloud auth application-default login` does not support Firebase Authentication with the default gcloud OAuth client. It requires the additional Firebase-documented custom OAuth client setup. A service-account credential supplied to ADC is therefore the simpler local option for this command.

## Change GM access

First perform a read-only dry run:

```powershell
npm run admin:set-gm -- person@example.com true --dry-run
```

Then apply the intended change:

```powershell
npm run admin:set-gm -- person@example.com true
```

To remove GM access:

```powershell
npm run admin:set-gm -- person@example.com false
```

The command:

- looks up the user by email;
- preserves unrelated custom claims;
- adds `gm: true` when enabling access;
- removes the `gm` claim when disabling access;
- reads the user again to verify the result;
- never prints the credential, credential path, or complete custom-claims object.

The affected user must sign in again or refresh their Firebase ID token before the updated claim appears in the application.

## Rotation and incident handling

Moving a key does not invalidate copies that may exist in backups, synced folders, messages, or prior archives. If a service-account key has ever been copied, shared, uploaded, or exposed outside the trusted workstation, disable/delete that key in Google Cloud IAM, create a replacement only if still required, and update the external credential file.

Prefer short-lived credentials or service-account impersonation when the Firebase Authentication workflow and local tooling support them. Periodically review active service-account keys and remove unused ones.

## References

- [Firebase Admin SDK setup](https://firebase.google.com/docs/admin/setup)
- [Set up Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc)
- [Service-account key security guidance](https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys)
