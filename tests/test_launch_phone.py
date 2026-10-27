import unittest
import commerce_launch as launch

class LaunchPhoneTests(unittest.TestCase):
    def test_test_phone_never_counts_as_real_contact(self):
        self.assertFalse(launch.valid_support_phone('000 000 000 (test)'))
        self.assertFalse(launch.valid_support_phone('000000000'))
        self.assertFalse(launch.valid_support_phone(''))
        self.assertTrue(launch.valid_support_phone('+48 601 234 567'))
