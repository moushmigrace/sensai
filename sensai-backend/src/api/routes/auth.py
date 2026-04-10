from fastapi import APIRouter
from typing import Dict
from api.db.user import insert_or_return_user
from api.utils.db import get_new_db_connection
from api.models import UserLoginData

router = APIRouter()


@router.post("/login")
async def login_or_signup_user(user_data: UserLoginData) -> Dict:
    # NOTE: Google ID token verification is temporarily disabled for local development.
    # TODO: Re-enable before deploying to production.
    #
    # try:
    #     if not settings.google_client_id:
    #         raise HTTPException(
    #             status_code=500, detail="Google Client ID not configured"
    #         )
    #     id_info = id_token.verify_oauth2_token(
    #         user_data.id_token, requests.Request(), settings.google_client_id
    #     )
    #     if id_info["email"] != user_data.email:
    #         raise HTTPException(
    #             status_code=401, detail="Email in token doesn't match provided email"
    #         )
    # except ValueError as e:
    #     raise HTTPException(
    #         status_code=401, detail=f"Invalid authentication token: {str(e)}"
    #     )

    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        user = await insert_or_return_user(
            cursor,
            user_data.email,
            user_data.given_name,
            user_data.family_name,
        )
        await conn.commit()

    return user
