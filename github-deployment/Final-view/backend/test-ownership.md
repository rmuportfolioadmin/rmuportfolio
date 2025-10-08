# Ownership Enforcement Test Scenarios

## Test Case 1: New File Creation
**Request**: User A (alice@gmail.com) saves a new portfolio
**Expected**: File created successfully with `uploadedBy: alice@gmail.com`
**Status Code**: 200
**Response**: `{ success: true, fileId: "..." }`

## Test Case 2: Owner Updates Own File
**Request**: User A (alice@gmail.com) updates their existing portfolio
**Expected**: File updated successfully, owner preserved
**Status Code**: 200
**Response**: `{ success: true, fileId: "..." }`

## Test Case 3: Non-Owner Attempts Update
**Request**: User B (bob@gmail.com) tries to update Alice's portfolio
**Expected**: Access denied
**Status Code**: 403
**Response**: 
```json
{
  "error": "Access denied: Only the file creator can update this portfolio",
  "details": "File belongs to alice@gmail.com, current user is bob@gmail.com"
}
```

## Test Case 4: Admin Email Special Cases
**Request**: Admin (rmuportfolioa@gmail.com) can still use admin endpoints (/api/list, /api/download)
**Expected**: Admin endpoints work normally
**Note**: Admin is not exempt from ownership rules on /api/save - they can only update portfolios they created

## File Properties After Creation
```json
{
  "appProperties": {
    "roll": "123-R45-A",
    "email": "alice@gmail.com",
    "uploadedBy": "alice@gmail.com",    // Immutable owner
    "createdAt": "2025-10-04T10:30:00Z", // Set on creation
    "updatedAt": "2025-10-04T10:35:00Z"  // Updated on each save
  }
}
```

## Security Benefits
1. **Data Integrity**: Students cannot modify other students' portfolios
2. **Audit Trail**: Clear ownership and timestamp tracking
3. **Consistent Enforcement**: Same rules apply regardless of user role (except admin endpoints)
4. **Error Transparency**: Clear error messages help users understand access restrictions